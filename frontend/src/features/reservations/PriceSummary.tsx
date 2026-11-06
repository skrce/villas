import type { PriceData, QuoteData } from "../../shared/pricing";
import { dateLabel, eventLabel, euros } from "../../shared/format";

export function PriceSummary({ price }: { price: PriceData }) {
  return (
    <div className="price-summary">
      <ul className="price-lines">
        {price.lines.map((line) => (
          <li key={line.startDate}>
            <div>
              <strong>{line.name}</strong>
              <p>
                {dateLabel(line.startDate)} → {dateLabel(line.endDate)}
              </p>
              <small>
                {line.nights} {line.nights === 1 ? "night" : "nights"} ×{" "}
                {euros(line.nightlyCents)}
              </small>
            </div>
            <strong>{euros(line.subtotalCents)}</strong>
          </li>
        ))}
      </ul>
      <div className="price-total">
        <span>Total accommodation</span>
        <strong>{euros(price.totalCents)}</strong>
      </div>
    </div>
  );
}
export function QuoteSummary({ quote }: { quote: QuoteData }) {
  return (
    <section className="quote-review" aria-label="Reviewed accommodation price">
      <h2>Review the price</h2>
      <p>
        {dateLabel(quote.startDate)} → {dateLabel(quote.endDate)} ·{" "}
        {quote.guestCount} {quote.guestCount === 1 ? "guest" : "guests"}
      </p>
      <PriceSummary price={quote.price} />
      <p className="hint">
        Quote valid until {eventLabel(quote.expiresAt)} in Skopje time. If rates
        change, Villas asks you to review a new quote before confirming.
      </p>
    </section>
  );
}
