import { createEmailDomainStore } from "./email-domain-store.js";

function generateCandidates(contacts, domain) {
  const candidates = new Set();

  contacts.forEach((contact) => {
    const first = String(contact.firstName || "").trim().toLowerCase();
    const last = String(contact.lastName || "").trim().toLowerCase();

    if (!first || !last) {
      return;
    }

    candidates.add(`${first}.${last}@${domain}`);
    candidates.add(`${last}.${first}@${domain}`);
    candidates.add(`${first}${last}@${domain}`);
    candidates.add(`${first[0]}${last}@${domain}`);
  });

  return [...candidates].map((email) => ({
    email,
    type: "inferred",
    verified: false
  }));
}

export function createEmailDomainResolutionService({
  perplexityClient,
  recruiterContactStore
}) {
  const store = createEmailDomainStore();
  const jobs = new Map();

  async function startResolution({ reviewId, organisation }) {
    const jobId = `email-domain-${reviewId}-${Date.now()}`;

    jobs.set(jobId, {
      jobId,
      reviewId,
      status: "queued",
      startedAt: new Date().toISOString()
    });

    processJob({
      jobId,
      reviewId,
      organisation
    }).catch((error) => {
      jobs.set(jobId, {
        ...jobs.get(jobId),
        status: "failed",
        error: error.message
      });
    });

    return jobs.get(jobId);
  }

  async function processJob({ jobId, reviewId, organisation }) {
    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: "researching"
    });

    const research = await perplexityClient.resolveEmailDomain({
      organisationName: organisation.name,
      organisationUrl: organisation.url,
      linkedinUrl: organisation.linkedinUrl
    });

    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: "validating"
    });

    const contacts = await recruiterContactStore.listByReview(reviewId);
    const linkedContacts = contacts.filter((contact) => contact.reviewId);

    const resolution = await store.save(reviewId, {
      ...research,
      organisation,
      emailCandidates: generateCandidates(
        linkedContacts,
        research.emailDomain
      )
    });

    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: "completed",
      completedAt: new Date().toISOString(),
      result: resolution
    });
  }

  return {
    startResolution,
    async getJob(jobId) {
      return jobs.get(jobId) || null;
    },
    async getResolution(reviewId) {
      return store.get(reviewId);
    }
  };
}
