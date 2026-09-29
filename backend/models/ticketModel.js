const mongoose = require("mongoose");

const ticketSchema = mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    price: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["reserved", "paid", "cancelled", "used"],
      default: "reserved",
    },
    // Add reservation expiry field
    reservationExpiry: {
      type: Date,
      required: function() {
        return this.status === "reserved";
      }
    },
    // Stripe PaymentIntent that paid for this ticket
    paymentId: {
      type: String,
    },
    qrCode: {
      type: String,
    },
    checked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Ticket = mongoose.model("Ticket", ticketSchema);

module.exports = Ticket;