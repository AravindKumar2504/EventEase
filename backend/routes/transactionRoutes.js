// routes/transactionRoutes.js
const express = require("express");
const {
  getMyTransactions,
  getTransactionById,
  getTransactionsForEvent,
  cancelTransaction,
  getPaymentStatus,
} = require("../controllers/transactionController");
const { protect, admin } = require("../middlewares/authMiddleware");

const router = express.Router();

// Protected routes
router.get("/my-transactions", protect, getMyTransactions);
router.get("/event/:eventId", protect, getTransactionsForEvent);
router.get("/:id", protect, getTransactionById);
router.put("/:id/cancel", protect, admin, cancelTransaction);
router.get("/:id/status", protect, getPaymentStatus);

module.exports = router;
