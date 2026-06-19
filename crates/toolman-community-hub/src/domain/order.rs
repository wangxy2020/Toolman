use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrderStatus {
    Pending,
    Escrow,
    Paid,
    Refunded,
    Cancelled,
}

impl OrderStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Escrow => "escrow",
            Self::Paid => "paid",
            Self::Refunded => "refunded",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn parse(value: &str) -> Result<Self, OrderError> {
        match value {
            "pending" => Ok(Self::Pending),
            "escrow" => Ok(Self::Escrow),
            "paid" => Ok(Self::Paid),
            "refunded" => Ok(Self::Refunded),
            "cancelled" => Ok(Self::Cancelled),
            other => Err(OrderError::InvalidStatus(other.to_string())),
        }
    }

    pub fn can_transition_to(self, next: Self) -> bool {
        use OrderStatus::*;
        matches!(
            (self, next),
            (Pending, Escrow)
                | (Pending, Cancelled)
                | (Escrow, Paid)
                | (Escrow, Refunded)
                | (Escrow, Cancelled)
                | (Paid, Refunded)
                | (Pending, Pending)
                | (Escrow, Escrow)
                | (Paid, Paid)
                | (Refunded, Refunded)
                | (Cancelled, Cancelled)
        )
    }

    pub fn validate_transition(from: Self, to: Self) -> Result<(), OrderError> {
        if from.can_transition_to(to) {
            Ok(())
        } else {
            Err(OrderError::InvalidStatusTransition {
                from: from.as_str().to_string(),
                to: to.as_str().to_string(),
            })
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityOrder {
    pub id: String,
    pub task_id: String,
    pub payer_id: String,
    pub payee_id: String,
    pub amount: f64,
    pub currency: String,
    pub status: OrderStatus,
    pub payment_provider: Option<String>,
    pub external_order_id: Option<String>,
    pub created_at: i64,
    pub paid_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct CreateOrderInput {
    pub task_id: String,
    pub payer_id: String,
    pub payee_id: String,
    pub amount: f64,
    pub currency: String,
}

#[derive(Debug, thiserror::Error)]
pub enum OrderError {
    #[error("invalid order status: {0}")]
    InvalidStatus(String),
    #[error("invalid order status transition: {from} -> {to}")]
    InvalidStatusTransition { from: String, to: String },
    #[error("order already exists for this task")]
    OrderConflict,
    #[error("task is not completed")]
    TaskNotCompleted,
    #[error("task has no assignee")]
    TaskMissingAssignee,
    #[error("invalid rating: must be between 1 and 5")]
    InvalidRating,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_manual_order_transitions() {
        assert!(OrderStatus::Pending.can_transition_to(OrderStatus::Escrow));
        assert!(OrderStatus::Escrow.can_transition_to(OrderStatus::Paid));
        assert!(OrderStatus::Paid.can_transition_to(OrderStatus::Refunded));
        assert!(!OrderStatus::Pending.can_transition_to(OrderStatus::Paid));
    }
}
