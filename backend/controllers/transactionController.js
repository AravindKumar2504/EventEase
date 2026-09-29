// controllers/transactionController.js
const mongoose = require("mongoose");
const Transaction = require("../models/transactionModel");
const Ticket = require("../models/ticketModel");
const Event = require("../models/eventModel");

// @desc    Get transactions for the logged-in user
// @route   GET /api/transactions/my-transactions
// @access  Private
const getMyTransactions = async (req, res) => {
  try {
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user: req.user._id })
      .populate({
        path: "event",
        select: "title startDate",
      })
      .populate({
        path: "ticket",
        select: "ticketNumber status",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const count = await Transaction.countDocuments({ user: req.user._id });

    res.json({
      transactions,
      page,
      pages: Math.ceil(count / limit),
      total: count,
    });
  } catch (error) {
    console.error("Get my transactions error:", error.message);
    res.status(500).json({ message: "Server error retrieving transactions" });
  }
};

// @desc    Get transaction by ID
// @route   GET /api/transactions/:id
// @access  Private
const getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate({
        path: "event",
        select: "title startDate startTime location imageUrl",
      })
      .populate({
        path: "ticket",
        select: "ticketNumber status purchaseDate",
      })
      .populate({
        path: "user",
        select: "name username email",
      });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // Check authorization: admin, the user who made the transaction, or the event organizer
    const isUser = transaction.user._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    // Get the event to check if user is the organizer
    const event = await Event.findById(transaction.event);
    const isOrganizer =
      event && event.organizer.toString() === req.user._id.toString();

    if (!isUser && !isAdmin && !isOrganizer) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this transaction" });
    }

    res.json(transaction);
  } catch (error) {
    console.error("Get transaction error:", error.message);
    res.status(500).json({ message: "Server error retrieving transaction" });
  }
};

// @desc    Get transactions for an event
// @route   GET /api/transactions/event/:eventId
// @access  Private/Organizer
const getTransactionsForEvent = async (req, res) => {
  try {
    const eventId = req.params.eventId;

    // Check if event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user is the event organizer or admin
    if (
      event.organizer.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to view these transactions" });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get transactions
    const transactions = await Transaction.find({ event: eventId })
      .populate("user", "name email username")
      .populate("ticket", "ticketNumber status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const count = await Transaction.countDocuments({ event: eventId });

    // Get total revenue - fix the ObjectId issue here
    const revenueData = await Transaction.aggregate([
      {
        $match: {
          event: new mongoose.Types.ObjectId(eventId),
          status: "completed",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

    res.json({
      transactions,
      page,
      pages: Math.ceil(count / limit),
      total: count,
      totalRevenue,
    });
  } catch (error) {
    console.error("Get event transactions error:", error.message);
    res.status(500).json({ message: "Server error retrieving transactions" });
  }
};

// @desc    Cancel a transaction (admin only)
// @route   PUT /api/transactions/:id/cancel
// @access  Private/Admin
const cancelTransaction = async (req, res) => {
  try {
    // Only admin can cancel transactions
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Not authorized to cancel transactions" });
    }

    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // Check if transaction is already refunded or failed
    if (transaction.status === "refunded" || transaction.status === "failed") {
      return res.status(400).json({
        message: `Transaction is already ${transaction.status}`,
      });
    }

    // Update transaction status
    transaction.status = "refunded";
    await transaction.save();

    // Update the associated ticket
    const ticket = await Ticket.findById(transaction.ticket);
    if (ticket) {
      ticket.status = "cancelled";
      await ticket.save();

      // Increase available tickets for the event
      const event = await Event.findById(transaction.event);
      if (event && event.status === "active") {
        event.ticketsRemaining += 1;
        await event.save();
      }
    }

    res.json({ message: "Transaction cancelled and refunded successfully" });
  } catch (error) {
    console.error("Cancel transaction error:", error.message);
    res.status(500).json({ message: "Server error cancelling transaction" });
  }
};

// @desc    Get payment status
// @route   GET /api/transactions/:id/status
// @access  Private
const getPaymentStatus = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id).select(
      "status paymentMethod amount createdAt"
    );

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // Check authorization
    const fullTransaction = await Transaction.findById(req.params.id);
    const isUser = fullTransaction.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    // Get the event to check if user is the organizer
    const event = await Event.findById(fullTransaction.event);
    const isOrganizer =
      event && event.organizer.toString() === req.user._id.toString();

    if (!isUser && !isAdmin && !isOrganizer) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this transaction" });
    }

    res.json({
      transactionId: transaction._id,
      status: transaction.status,
      paymentMethod: transaction.paymentMethod,
      amount: transaction.amount,
      timestamp: transaction.createdAt,
    });
  } catch (error) {
    console.error("Get payment status error:", error.message);
    res.status(500).json({ message: "Server error retrieving payment status" });
  }
};

module.exports = {
  getMyTransactions,
  getTransactionById,
  getTransactionsForEvent,
  cancelTransaction,
  getPaymentStatus,
};
