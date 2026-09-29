// src/pages/user/CheckoutPage.js
import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Alert,
  Button,
  Spinner,
} from "react-bootstrap";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import axios from "axios";
import useAuth from "../../hooks/useAuth";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import AlertMessage from "../../components/ui/AlertMessage";
import "./CheckoutPage.css";

const API_BASE_URL = "https://info6150-finalproject.onrender.com";
const CheckoutPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const stripe = useStripe();
  const elements = useElements();

  // Initialize state variables first - ALWAYS before any conditional returns
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reservationTimer, setReservationTimer] = useState(600); // 10 minutes in seconds
  const [ticketData, setTicketData] = useState(null);

  // Payment-specific states
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Use useEffect to handle redirection if no ticket data
  useEffect(() => {
    if (!location.state || !location.state.tickets) {
      navigate("/events");
    } else {
      setTicketData(location.state);
    }
  }, [location.state, navigate]);

  // Create payment intent when ticket data is available
  useEffect(() => {
    const createPaymentIntent = async () => {
      if (!ticketData) return;

      const { tickets } = ticketData;

      setLoading(true);
      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/payments/create-intent`,
          {
            ticketIds: tickets,
          }
        );

        setClientSecret(response.data.clientSecret);
        setPaymentIntentId(response.data.paymentIntentId);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to initialize payment");
      } finally {
        setLoading(false);
      }
    };

    createPaymentIntent();
  }, [ticketData]);

  // Countdown timer for reservation - only runs if ticketData exists
  useEffect(() => {
    if (!ticketData) return;

    if (reservationTimer <= 0) {
      navigate("/events");
      return;
    }

    const timerId = setTimeout(() => {
      setReservationTimer(reservationTimer - 1);
    }, 1000);

    return () => clearTimeout(timerId);
  }, [reservationTimer, navigate, ticketData]);

  // Format time remaining
  const formatTimeRemaining = () => {
    const minutes = Math.floor(reservationTimer / 60);
    const seconds = reservationTimer % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  // Format date
  const formatDate = (dateString) => {
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const handlePaymentSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: currentUser.name || "Event Attendee",
            },
          },
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (paymentIntent.status === "succeeded") {
        // Notify the server of successful payment
        const response = await axios.post(
          `${API_BASE_URL}/api/payments/success`,
          {
            paymentIntentId,
          }
        );

        setPaymentSuccess(true);

        // Show success message briefly before redirecting
        setTimeout(() => {
          navigate("/tickets", {
            state: { paymentSuccess: true },
          });
        }, 1500);
      }
    } catch (err) {
      setError(err.message || "Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  // Show loading spinner while waiting for data or redirecting
  if (!ticketData) {
    return <LoadingSpinner />;
  }

  // Destructure ticket data after we know it exists
  const { tickets, event, totalPrice, quantity } = ticketData;

  return (
    <Container className="py-5">
      <h2 className="mb-4">Complete Your Purchase</h2>

      <Alert variant="warning" className="d-flex align-items-center">
        <i className="bi bi-clock me-2"></i>
        Time remaining to complete purchase:{" "}
        <span className="ms-2 fw-bold">{formatTimeRemaining()}</span>
      </Alert>

      <Row className="mt-4">
        <Col lg={7}>
          <Card className="mb-4">
            <Card.Header>
              <h4 className="mb-0">Order Summary</h4>
            </Card.Header>
            <Card.Body>
              <div className="d-flex mb-4">
                <div className="event-image-small me-3">
                  <img
                    src={
                      event.imageUrl.startsWith("http")
                        ? event.imageUrl
                        : `/uploads/events/${event.imageUrl}`
                    }
                    alt={event.title}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = "/images/event-placeholder.png";
                    }}
                    className="img-fluid rounded"
                    style={{
                      width: "100px",
                      height: "100px",
                      objectFit: "cover",
                    }}
                  />
                </div>
                <div>
                  <h5>{event.title}</h5>
                  <p className="text-muted mb-1">
                    <i className="bi bi-calendar me-2"></i>
                    {formatDate(event.startDate)}, {event.startTime}
                  </p>
                  <p className="text-muted mb-0">
                    <i className="bi bi-geo-alt me-2"></i>
                    {event.location.venue}
                  </p>
                </div>
              </div>

              <hr />

              <div className="d-flex justify-content-between mb-2">
                <span>Tickets</span>
                <span>{quantity}</span>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Price per ticket</span>
                <span>${event.ticketPrice.toFixed(2)}</span>
              </div>
              <hr />
              <div className="d-flex justify-content-between align-items-center">
                <span className="fw-bold">Total</span>
                <span className="fw-bold fs-4">${totalPrice.toFixed(2)}</span>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={5}>
          <Card>
            <Card.Header>
              <h4 className="mb-0">Payment Details</h4>
            </Card.Header>
            <Card.Body>
              {error && <Alert variant="danger">{error}</Alert>}

              {paymentSuccess ? (
                <Alert variant="success">
                  <i className="bi bi-check-circle me-2"></i>
                  Payment successful! Your tickets have been confirmed.
                  <div className="mt-2">
                    <Spinner animation="border" size="sm" className="me-2" />
                    Redirecting to your tickets...
                  </div>
                </Alert>
              ) : loading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" />
                  <p className="mt-3">Initializing payment...</p>
                </div>
              ) : (
                <form onSubmit={handlePaymentSubmit}>
                  <div className="mb-4">
                    <label className="d-block mb-2">Card Information</label>
                    <div className="card-element-container p-3 border rounded bg-light">
                      <CardElement
                        options={{
                          style: {
                            base: {
                              fontSize: "16px",
                              color: "#424770",
                              "::placeholder": {
                                color: "#aab7c4",
                              },
                            },
                            invalid: {
                              color: "#9e2146",
                            },
                          },
                        }}
                      />
                    </div>
                    <div className="mt-2 text-muted small">
                      <p className="mb-1">For testing, use these cards:</p>
                      <p className="mb-1">Success: 4242 4242 4242 4242</p>
                      <p className="mb-0">Failure: 4000 0000 0000 0002</p>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="success"
                    size="lg"
                    className="w-100 mb-3"
                    disabled={!stripe || processing || !clientSecret}
                  >
                    {processing ? (
                      <>
                        <Spinner
                          animation="border"
                          size="sm"
                          className="me-2"
                        />
                        Processing...
                      </>
                    ) : (
                      `Pay $${totalPrice.toFixed(2)}`
                    )}
                  </Button>

                  <div className="text-center">
                    <Link to="/events" className="btn btn-outline-secondary">
                      Cancel and Return to Events
                    </Link>
                  </div>
                </form>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default CheckoutPage;
