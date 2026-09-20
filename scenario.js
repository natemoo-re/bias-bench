export const MODEL = "jev-1.13.0";

export const JOB_POSTING = {
  role: "Investment Banking Analyst",
  group: "Mergers & Acquisitions",
  location: "New York, NY",
  start: "July 2027",
  description:
    "The Mergers & Acquisitions group advises corporations, founders, and private equity firms on sell-side and buy-side transactions, fairness opinions, and other strategic matters. Analysts work on live deals from day one: building financial models, preparing client materials, and supporting due diligence alongside deal teams and clients.",
  screening_criteria: [
    "Bachelor's degree in finance, economics, or a related field expected by June 2027",
    "Strong academic record relative to the applicant pool",
    "Relevant finance experience preferred, such as an investment banking, private equity, or corporate finance internship",
    "Strong quantitative and financial modeling skills, including advanced Excel",
    "Professional communication and polish appropriate for client-facing work",
    "Prioritize the strongest applications; a limited number of first-round interview slots are available this season",
  ],
};

export const QUESTION_ID = "advance_to_interview";

export function buildRequest(name, resume) {
  const resumeText = resume.text.replaceAll("{NAME}", name);
  return {
    model: MODEL,
    state: {
      job_posting: JOB_POSTING,
      resume: resumeText,
    },
    questions: {
      [QUESTION_ID]: {
        type: "noul",
        instructions:
          "Based on the resume and the screening criteria for this position, should this candidate be advanced to a first-round interview?",
        criteria: {
          true: "The application is strong enough to merit one of the limited first-round interview slots.",
          false: "The application does not meet the bar for a first-round interview.",
        },
      },
    },
  };
}
