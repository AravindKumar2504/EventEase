// controllers/ticketController.js
const mongoose = require("mongoose");
const Ticket = require("../models/ticketModel");
const Event = require("../models/eventModel");
const User = require("../models/userModel");

// @desc    Book tickets with reservation
// @route   POST /api/tickets
// @access  Private
const bookTickets = async (req, res) => {
  try {
    const { eventId, quantity } = req.body;

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const qty = parseInt(quantity) || 1;

    if (qty <= 0) {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }

    // Check if event exists and is active
    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.status !== "active") {
      return res.status(400).json({ message: "Event is not active" });
    }

    // Check if event has ended
    if (new Date(event.endDate) < new Date()) {
      return res.status(400).json({ message: "This event has already ended" });
    }

    // Check if there are enough tickets available
    if (event.ticketsRemaining < qty) {
      return res
        .status(400)
        .json({ message: `Only ${event.ticketsRemaining} tickets remaining` });
    }

    // Calculate total price
    const totalPrice = event.ticketPrice * qty;

    // Set reservation expiry to 10 minutes from now
    const reservationExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Create tickets one by one with explicit ticket number generation
    const tickets = [];

    for (let i = 0; i < qty; i++) {
      // Generate ticket number
      const prefix = "EVTEZ";
      const random = Math.floor(100000 + Math.random() * 900000).toString();
      const timestamp = Date.now().toString().slice(-6);
      const ticketNumber = `${prefix}-${random}-${timestamp}`;

      const ticket = new Ticket({
        ticketNumber,
        event: eventId,
        user: req.user._id,
        price: event.ticketPrice,
        status: "reserved",
        reservationExpiry: reservationExpiry,
      });

      await ticket.save();
      tickets.push(ticket);
    }

    // Update tickets remaining
    event.ticketsRemaining -= qty;
    await event.save();

    res.status(201).json({
      message: `${qty} ticket(s) reserved successfully`,
      tickets: tickets.map((ticket) => ticket._id),
      totalPrice,
    });
  } catch (error) {
    console.error("Book ticket error:", error.message);
    res.status(500).json({ message: "Server error booking ticket" });
  }
};

// @desc    Process expired ticket reservations
// @route   Not exposed via API - called by a cron job
// @access  Private
const processExpiredReservations = async () => {
  try {
    console.log("Checking for expired ticket reservations...");

    // Find all expired reservations
    const expiredTickets = await Ticket.find({
      status: "reserved",
      reservationExpiry: { $lt: new Date() },
    });

    console.log(`Found ${expiredTickets.length} expired ticket reservations`);

    let releasedCount = 0;

    // Process each expired ticket
    for (const ticket of expiredTickets) {
      // Cancel only if still reserved; a payment may have claimed it since the find
      const result = await Ticket.updateOne(
        { _id: ticket._id, status: "reserved" },
        { status: "cancelled" }
      );

      if (result.modifiedCount === 0) continue;

      // Update event ticket count
      await Event.findByIdAndUpdate(ticket.event, {
        $inc: { ticketsRemaining: 1 },
      });

      releasedCount++;
      console.log(`Released ticket ${ticket.ticketNumber}`);
    }

    return {
      processedCount: releasedCount,
      success: true,
    };
  } catch (error) {
    console.error("Error processing expired tickets:", error);
    return {
      processedCount: 0,
      success: false,
      error: error.message,
    };
  }
};

// @desc    Get tickets for the logged-in user
// @route   GET /api/tickets/my-tickets
// @access  Private
const getMyTickets = async (req, res) => {
  try {
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const tickets = await Ticket.find({ user: req.user._id })
      .populate({
        path: "event",
        select: "title startDate startTime location imageUrl",
      })
      .sort({ purchaseDate: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const count = await Ticket.countDocuments({ user: req.user._id });

    res.json({
      tickets,
      page,
      pages: Math.ceil(count / limit),
      total: count,
    });
  } catch (error) {
    console.error("Get my tickets error:", error.message);
    res.status(500).json({ message: "Server error retrieving tickets" });
  }
};

// @desc    Get a ticket by ID
// @route   GET /api/tickets/:id
// @access  Private
const getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id).populate({
      path: "event",
      select:
        "title description startDate endDate startTime endTime location imageUrl organizer",
      populate: {
        path: "organizer",
        select: "name username",
      },
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Check if user owns the ticket or is the organizer or admin
    const isOwner = ticket.user.toString() === req.user._id.toString();
    const isOrganizer =
      ticket.event.organizer._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isOrganizer && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this ticket" });
    }

    res.json(ticket);
  } catch (error) {
    console.error("Get ticket error:", error.message);
    res.status(500).json({ message: "Server error retrieving ticket" });
  }
};

// @desc    Cancel a ticket
// @route   PUT /api/tickets/:id/cancel
// @access  Private
const cancelTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Check if user owns the ticket or is admin
    if (
      ticket.user.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to cancel this ticket" });
    }

    // Check if ticket is already used or cancelled
    if (ticket.status === "used") {
      return res.status(400).json({ message: "Cannot cancel a used ticket" });
    }

    if (ticket.status === "cancelled") {
      return res.status(400).json({ message: "Ticket is already cancelled" });
    }

    // Update ticket status
    ticket.status = "cancelled";
    await ticket.save();

    // Increase available tickets for the event
    const event = await Event.findById(ticket.event);
    if (event && event.status === "active") {
      event.ticketsRemaining += 1;
      await event.save();
    }

    res.json({ message: "Ticket cancelled successfully" });
  } catch (error) {
    console.error("Cancel ticket error:", error.message);
    res.status(500).json({ message: "Server error cancelling ticket" });
  }
};

// @desc    Verify a ticket
// @route   GET /api/tickets/:id/verify
// @access  Private/Organizer
const verifyTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id).populate(
      "event",
      "organizer title startDate endDate"
    );

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Check if user is the event organizer or admin
    if (
      ticket.event.organizer.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to verify this ticket" });
    }

    // Validate ticket
    const currentDate = new Date();
    const eventStartDate = new Date(ticket.event.startDate);
    const eventEndDate = new Date(ticket.event.endDate);

    // Validation result object
    const validationResult = {
      isValid: false,
      status: ticket.status,
      eventTitle: ticket.event.title,
      message: "",
    };

    // Check ticket status
    if (ticket.status === "cancelled") {
      validationResult.message = "Ticket has been cancelled";
    } else if (ticket.status === "used") {
      validationResult.message = "Ticket has already been used";
    } else if (currentDate < eventStartDate) {
      validationResult.message = "Event has not started yet";
    } else if (currentDate > eventEndDate) {
      validationResult.message = "Event has already ended";
    } else {
      validationResult.isValid = true;
      validationResult.message = "Ticket is valid";
    }

    res.json(validationResult);
  } catch (error) {
    console.error("Verify ticket error:", error.message);
    res.status(500).json({ message: "Server error verifying ticket" });
  }
};

// @desc    Get a ticket by ticket number
// @route   GET /api/tickets/by-number/:ticketNumber
// @access  Private
const getTicketByNumber = async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      ticketNumber: req.params.ticketNumber,
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.json(ticket);
  } catch (error) {
    console.error("Get ticket by number error:", error.message);
    res.status(500).json({ message: "Server error retrieving ticket" });
  }
};

// @desc    Mark ticket as used
// @route   PUT /api/tickets/:id/mark-used
// @access  Private/Organizer
const markTicketAsUsed = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id).populate(
      "event",
      "organizer"
    );

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Check if user is the event organizer or admin
    if (
      ticket.event.organizer.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to mark this ticket" });
    }

    // Check if ticket is already used or cancelled
    if (ticket.status === "used") {
      return res.status(400).json({ message: "Ticket is already used" });
    }

    if (ticket.status === "cancelled") {
      return res
        .status(400)
        .json({ message: "Cannot mark a cancelled ticket as used" });
    }

    // Update ticket status
    ticket.status = "used";
    ticket.checked = true;
    await ticket.save();

    res.json({ message: "Ticket marked as used successfully" });
  } catch (error) {
    console.error("Mark ticket error:", error.message);
    res.status(500).json({ message: "Server error marking ticket" });
  }
};

// @desc    Get tickets for a specific event
// @route   GET /api/tickets/event/:eventId
// @access  Private/Organizer
const getTicketsForEvent = async (req, res) => {
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
        .json({ message: "Not authorized to view these tickets" });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get tickets
    const tickets = await Ticket.find({ event: eventId })
      .populate("user", "name email username")
      .sort({ purchaseDate: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const count = await Ticket.countDocuments({ event: eventId });

    // Get counts by status - fix the ObjectId issue here
    const statusCounts = await Ticket.aggregate([
      { $match: { event: new mongoose.Types.ObjectId(eventId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Format status counts
    const countsByStatus = {};
    statusCounts.forEach((item) => {
      countsByStatus[item._id] = item.count;
    });

    res.json({
      tickets,
      page,
      pages: Math.ceil(count / limit),
      total: count,
      countsByStatus,
    });
  } catch (error) {
    console.error("Get event tickets error:", error.message);
    res.status(500).json({ message: "Server error retrieving tickets" });
  }
};

module.exports = {
  bookTickets, // Renamed from bookTicket to bookTickets
  processExpiredReservations, // New function for cron job
  getMyTickets,
  getTicketById,
  getTicketByNumber,
  cancelTicket,
  verifyTicket,
  markTicketAsUsed,
  getTicketsForEvent,
};