# QM Higher Education Rubric (7th Edition) — Crosswalk

This document maps the Philosophy 101 course shell to the eight General Standards of the Quality Matters Higher Education Rubric, 7th Edition (Specific Review Standards 1.1–8.7). For each standard, the cell shows where in the deployed app the requirement is met.

App routes referenced below are relative to the artifact root (`/`). Backend endpoints are under `/api`.

---

## General Standard 1: Course Overview and Introduction

| SRS | Requirement | Where it is met |
| --- | --- | --- |
| 1.1 | Instructions make clear how to get started and where to find course components. | `/` (Start Here) — first section "How to Get Started" walks through login → Syllabus → Modules; persistent top nav lists every section. |
| 1.2 | Learners are introduced to the purpose and structure of the course. | `/` "About this Course" + `/syllabus` "Course Description" and "How the Course Is Organized". |
| 1.3 | Communication expectations for online discussions, email, and other forms of interaction are clearly stated. | `/` and `/syllabus` "Communication & Netiquette" section. |
| 1.4 | Course and institutional policies with which the learner is expected to comply are clearly stated within the course, or a link to current policies is provided. | `/syllabus` "Institutional Policies" + `/support` for live links. |
| 1.5 | Minimum technology requirements for the course are clearly stated, and information on how to obtain the technologies is provided. | `/` "Technical Requirements" and `/support` "Tech Support" panel. |
| 1.6 | Prerequisite knowledge in the discipline and/or any required competencies are clearly stated. | `/syllabus` "Prerequisites" — none required; PHIL 101 is an introductory course. |
| 1.7 | Minimum technical skills expected of the learner are clearly stated. | `/` "Minimum Technical Skills" callout. |
| 1.8 | The self-introduction by the instructor is professional and is available online. | `/` "Meet Your Instructor" — Dr. Lawrence Dodge bio; the AI Tutor speaks for the instructor of record at `/tutor/:id`. |
| 1.9 | Learners are asked to introduce themselves to the class. | `/` "Introduce Yourself" form → `POST /api/progress/intro` (persisted to the `students.intro` column and visible to the AI Tutor). |

## General Standard 2: Learning Objectives (Competencies)

| SRS | Requirement | Where it is met |
| --- | --- | --- |
| 2.1 | The course learning objectives, or course/program competencies, describe outcomes that are measurable. | `/syllabus` "Course Learning Outcomes" — synthesized from the 13 module objectives; each is action-verb based and measurable. |
| 2.2 | The module/unit-level learning objectives or competencies describe outcomes that are measurable and consistent with the course-level objectives or competencies. | Each `/modules/:id` page renders verbatim module objectives from `curriculum.ts`. |
| 2.3 | Learning objectives or competencies are stated clearly, are written from the learner's perspective, and are prominently located in the course. | Module objectives appear at the top of every module detail page; course outcomes appear on `/syllabus`. |
| 2.4 | The relationship between learning objectives or competencies and learning activities is clearly stated. | Every assignment prompt is rendered alongside the module's objectives so the alignment is visible at a glance. |
| 2.5 | The learning objectives or competencies are suited to the level of the course. | Verified by alignment with the introductory-level course text (Dodge); assignments are discussion / short-essay / term-paper format appropriate for an introductory course. |

## General Standard 3: Assessment and Measurement

| SRS | Requirement | Where it is met |
| --- | --- | --- |
| 3.1 | The assessments measure the stated learning objectives or competencies. | Each module's assignment prompt directly targets that module's objectives; mapping is visible on every `/modules/:id` page. |
| 3.2 | The course grading policy is stated clearly at the beginning of the course. | `/syllabus` "Grading" section + point breakdown table. |
| 3.3 | Specific and descriptive criteria are provided for the evaluation of learners' work, and their connection to the course grading policy is clearly explained. | Each module page shows points and the model-response reference is used by the AI Tutor for formative critique. |
| 3.4 | The assessments used are sequenced, varied, and suited to the level of the course. | Curriculum mixes 6 discussions, 5 essays, 1 discussion, and a 2-part term paper, sequenced from concrete (Branches of Philosophy) to applied (Term Paper). |
| 3.5 | The course provides learners with multiple opportunities to track their learning progress with timely feedback. | `/assessments` shows submission status across all modules; AI Tutor (`/tutor/:id`) provides immediate Socratic feedback; `/assessments` Practice Critique tool gives learners self-check practice. |

## General Standard 4: Instructional Materials

| SRS | Requirement | Where it is met |
| --- | --- | --- |
| 4.1 | The instructional materials contribute to the achievement of the stated learning objectives or competencies. | Reading on each `/modules/:id` is the verbatim textbook content authored for that module's objectives (Dodge). |
| 4.2 | The relationship between the use of instructional materials in the course and completing learning activities is clearly explained. | Each module page presents Reading immediately above the Assignment so learners see how the reading feeds the prompt. |
| 4.3 | The course models the academic integrity expected of learners by providing both source references and permissions for use of instructional materials. | `/` and `/syllabus` cite Dodge's text as the open educational source; Anthropic Claude attribution appears on `/tutor/:id`. |
| 4.4 | The instructional materials represent up-to-date theory and practice in the discipline. | Verified by the curriculum author (Dodge). |
| 4.5 | A variety of instructional materials is used in the course. | Text reading + interactive AI Socratic dialogue + practice-critique exercises. |

## General Standard 5: Learning Activities and Learner Interaction

| SRS | Requirement | Where it is met |
| --- | --- | --- |
| 5.1 | The learning activities promote the achievement of the stated learning objectives or competencies. | Discussion prompts, essays, and the term paper are aligned 1:1 with module objectives. |
| 5.2 | Learning activities provide opportunities for interaction that support active learning. | AI Tutor at `/tutor/:id` supports Socratic dialogue; Practice Critique on `/assessments` engages learners in active evaluation. |
| 5.3 | The instructor's plan for interacting with learners during the course is clearly stated. | `/` "How the Instructor Interacts With You" section explains AI-mediated tutoring + human review of submissions. |
| 5.4 | The requirements for learner interaction are clearly stated. | `/syllabus` "Engagement Expectations" — minimum tutor session per module, submission deadlines. |

## General Standard 6: Course Technology

| SRS | Requirement | Where it is met |
| --- | --- | --- |
| 6.1 | The tools used in the course support the learning objectives or competencies. | React + AI Tutor (Claude Sonnet 4.5) directly support Socratic philosophical inquiry. |
| 6.2 | Course tools promote learner engagement and active learning. | Streaming AI Tutor, Practice Critique, persistent submission history. |
| 6.3 | A variety of technology is used in the course. | Web UI, real-time SSE chat, persistent database-backed progress, printable syllabus. |
| 6.4 | The course provides learners with information on protecting their data and privacy. | `/support` "Privacy & Data" panel; cookie notice on first visit. |

## General Standard 7: Learner Support

| SRS | Requirement | Where it is met |
| --- | --- | --- |
| 7.1 | The course instructions articulate or link to a clear description of the technical support offered and how to obtain it. | `/support` "Tech Support" panel + link from `/` and `/syllabus`. |
| 7.2 | Course instructions articulate or link to the institution's accessibility policies and services. | `/accessibility` page + footer link on every page. |
| 7.3 | Course instructions articulate or link to the institution's academic support services and resources that can help learners succeed in the course. | `/support` "Academic Support" panel — tutoring, library, writing center. |
| 7.4 | Course instructions articulate or link to the institution's student services and resources that can help learners succeed. | `/support` "Student Services" panel — counseling, wellness, advising. |

## General Standard 8: Accessibility and Usability

| SRS | Requirement | Where it is met |
| --- | --- | --- |
| 8.1 | Course navigation facilitates ease of use. | Persistent top nav with seven primary links; wouter SPA routing; visible focus rings. |
| 8.2 | The course design facilitates readability. | Serif headings, sans-serif body, generous line-height, restrained palette, max content width on all text pages. |
| 8.3 | The course provides accessible text and images in files, documents, LMS pages, and web pages to meet the needs of diverse learners. | Semantic HTML, ARIA labels on all interactive controls, alt text on every image, keyboard-navigable forms. |
| 8.4 | The course provides alternative means of access to multimedia content in formats that meet the needs of diverse learners. | No required multimedia in this introductory shell; printable syllabus available via the browser print dialog. |
| 8.5 | Course multimedia facilitates ease of use. | N/A — no required multimedia. Where future media is added, captions and transcripts will be required per `/accessibility`. |
| 8.6 | Vendor accessibility statements are provided for all technologies required in the course. | `/accessibility` lists Anthropic's accessibility statement link and the React/shadcn/ui accessibility commitment. |
| 8.7 | The course design accommodates the use of assistive technologies. | Tested with screen-reader semantics (Radix UI primitives); keyboard map published on `/accessibility`. |

---

## Regular and Substantive Interaction (RSI)

The course satisfies federal RSI expectations through:

- **Predictable, scheduled interaction:** the AI Tutor (instructor of record's voice) is always available and persists conversation history per module so the instructor can review.
- **Substantive academic engagement:** Socratic prompts, counter-arguments, formative critique, and module-aligned questions — never "did you read it?" interactions.
- **Initiated by the instructor:** the AI Tutor opens every module with an invitation to discuss the module's central question.
- **Monitored progress:** every submission and every tutor message is persisted (`submissions`, `tutor_messages` tables) so the human instructor of record can audit engagement.

## Academic Integrity & AI Use Policy

Stated on `/` and `/syllabus`:

- Students may use the AI Tutor for Socratic discussion, counter-arguments, clarification, and feedback on their own draft thinking.
- The AI Tutor is system-prompted to refuse to write assignments for students; if asked, it pivots to questions.
- All submitted work must be the student's own writing. Submissions are timestamped and stored.
- Use of any third-party AI to generate submitted text is a violation of the academic integrity policy.
