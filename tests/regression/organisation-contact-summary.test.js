import test from "node:test";
import assert from "node:assert/strict";
import { renderRecruiterContacts } from "../../src/interfaces/http/rendering.js";

test("empty organisation summary retains a hidden refresh target", () => {
  const html = renderRecruiterContacts([]);
  assert.match(html, /class="review-section organisation-contact-summary"\s+hidden/);
  assert.match(html, /class="organisation-contact-summary-body"/);
});

test("organisation summary renders linked contact details and escapes text", () => {
  const html = renderRecruiterContacts([{
    fullName: "Jane <Smith>",
    role: "Recruitment & People",
    linkedinUrl: "https://www.linkedin.com/in/synthetic-summary",
    emailDomain: "saved-company.test"
  }]);

  assert.doesNotMatch(
    html,
    /class="review-section organisation-contact-summary"\s+hidden/
  );
  assert.match(html, /Jane &lt;Smith&gt;/);
  assert.match(html, /Recruitment &amp; People/);
  assert.match(html, /saved-company\.test/);
});
