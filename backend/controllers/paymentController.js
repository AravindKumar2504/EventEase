const stripe = process.env.STRIPE_SECRET_KEY 
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// Log whether Stripe is properly initialized
console.log('Stripe initialized:', !!stripe);
const Transaction = require('../models/transactionModel');
const Ticket = require('../models/ticketModel');
const mongoose = require('mongoose');

// Stripe rejects USD charges under $0.50
const MIN_CHARGE_CENTS = 50;

// @desc    Create payment intent
// @route   POST /api/payments/create-intent
// @access  Private
const createPaymentIntent = async (req, res) => {
  try {
    // Only ticket IDs come from the client; the amount is computed from the tickets below
    const { ticketIds } = req.body;
    
    if (!Array.isArray(ticketIds) || !ticketIds.length) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    const uniqueTicketIds = [...new Set(ticketIds.map(String))];
    
    if (!uniqueTicketIds.every(id => mongoose.isObjectIdOrHexString(id))) {
      return res.status(400).json({ message: 'One or more ticket IDs are invalid' });
    }
    
    // Verify all tickets exist and belong to the user
    const tickets = await Ticket.find({
      _id: { $in: uniqueTicketIds },
      user: req.user._id,
      status: 'reserved'
    }).populate('event', 'title');
    
    if (tickets.length !== uniqueTicketIds.length) {
      return res.status(400).json({ 
        message: 'One or more tickets are invalid or not in reserved status' 
      });
    }
    
    // Check if any tickets have expired reservations
    const now = new Date();
    const expiredTickets = tickets.filter(
      ticket => ticket.reservationExpiry && ticket.reservationExpiry < now
    );
    
    if (expiredTickets.length > 0) {
      return res.status(400).json({ 
        message: 'One or more ticket reservations have expired' 
      });
    }
    
    // Charge each ticket's price as stored at reservation, summed in whole cents
    const amountInCents = tickets.reduce(
      (sum, ticket) => sum + Math.round(ticket.price * 100),
      0
    );
    
    if (amountInCents < MIN_CHARGE_CENTS) {
      return res.status(400).json({
        message: 'Order total is below the $0.50 minimum for card payments'
      });
    }
    
    // Create a payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: {
        ticketIds: uniqueTicketIds.join(','),
        userId: req.user._id.toString()
      }
    });
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountInCents / 100
    });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ message: 'Error creating payment intent' });
  }
};

// Marks a succeeded payment's tickets paid and records one transaction per
// ticket. Both /success and the webhook call it, so it is safe to repeat.
// Tickets the payment could not claim (the hold expired and the seat was
// released, or another payment got there first) are refunded.
const fulfillPayment = async (paymentIntent) => {
  const ticketIds = paymentIntent.metadata.ticketIds.split(',');
  const userId = paymentIntent.metadata.userId;
  
  const fulfilled = [];
  const unfulfilled = [];
  
  for (const ticketId of ticketIds) {
    // Only a still-reserved ticket can be claimed, so a released seat can't be sold twice
    let ticket = await Ticket.findOneAndUpdate(
      { _id: ticketId, user: userId, status: 'reserved' },
      { status: 'paid', paymentId: paymentIntent.id },
      { new: true }
    );
    
    // Already claimed by this payment on an earlier call
    // (tickets paid before paymentId was stored have none)
    if (!ticket) {
      ticket = await Ticket.findOne({
        _id: ticketId,
        user: userId,
        $or: [
          { paymentId: paymentIntent.id },
          { paymentId: { $exists: false }, status: { $in: ['paid', 'used'] } }
        ]
      });
    }
    
    if (ticket) {
      fulfilled.push(ticket);
    } else {
      unfulfilled.push(ticketId);
    }
  }
  
  // The unique (paymentId, ticket) index turns a repeat or concurrent insert into a no-op
  const transactions = [];
  
  for (const ticket of fulfilled) {
    const filter = { paymentId: paymentIntent.id, ticket: ticket._id };
    let transaction;
    
    try {
      transaction = await Transaction.findOneAndUpdate(
        filter,
        {
          $setOnInsert: {
            user: ticket.user,
            event: ticket.event,
            amount: ticket.price,
            paymentMethod: 'credit_card',
            status: 'completed'
          }
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      // A concurrent call inserted it first
      if (error.code !== 11000) throw error;
      transaction = await Transaction.findOne(filter);
    }
    
    transactions.push(transaction);
  }
  
  // Refund what was charged for unclaimed tickets, minus anything already refunded
  let refundedCents = 0;
  
  if (unfulfilled.length > 0) {
    const unclaimed = await Ticket.find({ _id: { $in: unfulfilled } });
    const owedCents = unclaimed.reduce(
      (sum, ticket) => sum + Math.round(ticket.price * 100),
      0
    );
    const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
    refundedCents = Math.min(owedCents, charge.amount);
    
    if (refundedCents > charge.amount_refunded) {
      await stripe.refunds.create(
        {
          payment_intent: paymentIntent.id,
          amount: refundedCents - charge.amount_refunded
        },
        { idempotencyKey: `refund-${paymentIntent.id}-${refundedCents}` }
      );
    }
  }
  
  return { transactions, unfulfilledCount: unfulfilled.length, refundedCents };
};

// @desc    Handle payment success
// @route   POST /api/payments/success
// @access  Private
const handlePaymentSuccess = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    
    if (!paymentIntentId) {
      return res.status(400).json({ message: 'Payment intent ID required' });
    }
    
    // Verify the payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ message: 'Payment has not succeeded' });
    }
    
    if (!paymentIntent.metadata.ticketIds) {
      return res.status(400).json({ message: 'Payment is not linked to any tickets' });
    }
    
    // Verify user matches
    if (paymentIntent.metadata.userId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    const { transactions, unfulfilledCount, refundedCents } =
      await fulfillPayment(paymentIntent);
    
    if (unfulfilledCount > 0) {
      return res.status(409).json({
        message: `${unfulfilledCount} ticket reservation(s) expired before payment completed, so you were refunded $${(refundedCents / 100).toFixed(2)} for them`,
        transactions: transactions.map(t => t._id)
      });
    }
    
    res.status(201).json({
      message: 'Payment processed successfully',
      transactions: transactions.map(t => t._id)
    });
  } catch (error) {
    console.error('Payment success error:', error);
    res.status(500).json({ message: 'Error processing payment success' });
  }
};

// @desc    Handle webhook events from Stripe
// @route   POST /api/payments/webhook
// @access  Public
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle specific event types
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    
    console.log('PaymentIntent succeeded:', paymentIntent.id);
    
    if (paymentIntent.metadata.ticketIds) {
      try {
        await fulfillPayment(paymentIntent);
      } catch (error) {
        console.error('Webhook fulfillment error:', error);
        // A non-2xx response makes Stripe retry, and fulfillment is safe to repeat
        return res.status(500).json({ received: false });
      }
    }
  }
  
  res.json({ received: true });
};

module.exports = {
  createPaymentIntent,
  handlePaymentSuccess,
  handleWebhook
};