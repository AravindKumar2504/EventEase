const mongoose = require('mongoose');

const transactionSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true
    },
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    paymentMethod: {
      type: String,
      enum: ['credit_card', 'debit_card', 'paypal', 'other'],
      required: true
    },
    paymentId: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

// One transaction per ticket per payment, so a retried confirmation can't duplicate it
transactionSchema.index({ paymentId: 1, ticket: 1 }, { unique: true });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;