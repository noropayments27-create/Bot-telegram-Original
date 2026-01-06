const express = require("express");
const {
  createOrder,
  getOrderById,
  submitPaymentProof,
  markOrderPaid,
  rejectPayment,
} = require("./orders.controller");

const router = express.Router();

router.post("/", createOrder);
router.get("/:id", getOrderById);
router.post("/:id/payment-proof", submitPaymentProof);
router.post("/:id/mark-paid", markOrderPaid);
router.post("/:id/reject-payment", rejectPayment);

module.exports = router;
