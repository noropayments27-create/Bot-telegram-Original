const express = require("express");
const {
  createOrder,
  getOrderById,
  getPaymentMethods,
  payOrderWithWallet,
  submitPaymentProof,
  markOrderPaid,
  rejectPayment,
} = require("./orders.controller");

const router = express.Router();

router.post("/", createOrder);
router.get("/payment-methods", getPaymentMethods);
router.get("/:id", getOrderById);
router.post("/:id/pay-with-wallet", payOrderWithWallet);
router.post("/:id/payment-proof", submitPaymentProof);
router.post("/:id/mark-paid", markOrderPaid);
router.post("/:id/reject-payment", rejectPayment);

module.exports = router;
