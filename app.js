
/* ADDITIONAL APPLICATION COMPONENTS */

.fleet-overview-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}

.fleet-overview-row:last-child {
  border-bottom: 0;
}

.fleet-overview-row strong {
  font-size: 11px;
}

.fleet-overview-row p {
  font-size: 10px;
  margin-top: 4px;
}

.pricing-summary {
  background: #101b2b;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 15px;
  margin-top: 18px;
}

.pricing-summary h3 {
  color: var(--gold-light);
  margin-bottom: 12px;
  font-size: 13px;
}

.pricing-summary p {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}

.pricing-summary p strong {
  color: var(--text);
}

.pricing-total {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding-top: 13px;
  margin-top: 7px;
  font-size: 13px;
  color: var(--gold-light);
}

.pricing-total strong {
  font-size: 17px;
}

@media (max-width: 600px) {
  .fleet-overview-row {
    align-items: flex-start;
  }
}
