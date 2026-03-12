**System Design Brief**

*Portable, Privacy-Preserving Memory for LLM-Powered Educational Tutors*

Prepared for: Designer | Format: Slides \+ Architecture Diagram

# **1\. The Problem**

Modern AI-powered tutoring systems face two compounding challenges:

* LLMs have no persistent memory across sessions, so tutors cannot build on prior interactions or maintain continuity with a student's learning journey.

* Granting an AI tutor access to student data raises serious privacy concerns — it is unclear what data is being transmitted, to whom, and whether it can be revoked.

Existing approaches tend to solve one problem at the expense of the other: storing data centrally in a cloud platform enables memory but removes student and teacher control, while avoiding storage entirely preserves privacy but produces a stateless, forgetful tutor.

# **2\. Core Design Insight**

The key insight driving this system is that data access and data transmission are two different things — and they should be treated separately.

Rather than allowing an LLM to directly query or access student data, this system interposes a trusted, local component called the Compiler between the data and the model. The Compiler reads student data, but the LLM never does. The LLM only ever receives a fully-assembled, text-based prompt. This separation means:

* Student data never leaves the local environment unless the user explicitly sends the assembled prompt.

* Access to student data is granted to the Compiler, not to any cloud service, and can be revoked at any time.

* Teachers and students can inspect and control exactly what information will be included in any AI interaction.

# **3\. System Overview**

The system is built around three foundational concepts: the Filesystem, Meta-Files, and the Compiler.

## **3.1  The Filesystem**

All student data lives in a filesystem. This is intentionally flexible — it can be a student's local computer, a shared school drive, or an application database that models a filesystem. The filesystem is the source of truth and the boundary of trust. Nothing outside this boundary has direct access to its contents.

The filesystem contains ordinary files: notes, assignments, quiz results, project artifacts, and any other learning-related data. These files are owned and controlled by the student (or the institution, depending on deployment).

## **3.2  Meta-Files**

Meta-files are structured documents — likely written in Markdown — that describe how to assemble a prompt for a specific type of tutoring interaction. They are templates that reference other files in the filesystem rather than embedding content directly.

A meta-file answers the question: "Given a student asking about Topic X, what information from their filesystem would be useful context for an LLM tutor?" Meta-files are typically authored by the teacher, who understands both the pedagogical context and what student data is relevant and appropriate to share.

Crucially, meta-files express retrieval logic abstractly. They describe what to include (e.g., "the student's last three quiz results for this unit," "their current learning objectives") without being data themselves. This makes them easy to audit, version, and revise.

Students and other stakeholders can also author or modify meta-files for their own purposes, creating a flexible, multi-stakeholder authoring model.

## **3.3  The Compiler**

The Compiler is a local program — a trusted, auditable piece of software — that takes a meta-file and a student's filesystem as input, and produces a fully populated prompt as output.

At the moment a user submits a query, the Compiler:

1. Reads the relevant meta-file for the query type.

2. Traverses the filesystem to retrieve only the files referenced in that meta-file.

3. Assembles the content into a complete, self-contained prompt.

4. Hands off the populated prompt — the LLM only ever sees this final output.

The Compiler is the only component granted filesystem access. This access is scoped, auditable, and revocable. A user or institution can remove or restrict the Compiler's permissions at any time without affecting the data itself.

# **4\. End-to-End Interaction Flow**

The following describes a complete cycle, from student query to LLM response:

**Step 1 — Query:** A student submits a question to the tutoring interface (or initiates a session).

**Step 2 — Meta-file Selection:** The system (or the student) selects the appropriate meta-file for the type of query being asked. Different meta-files may exist for different subjects, question types, or levels of detail.

**Step 3 — Compilation:** The Compiler runs. It reads the meta-file, fetches the referenced files from the filesystem, and assembles the populated prompt. No data leaves the local environment at this stage.

**Step 4 — Prompt Delivery:** The populated prompt is sent to an LLM. This can happen automatically via an application, or manually — the user can literally copy and paste the prompt text into any LLM interface. This design means the system is not dependent on any specific AI provider.

**Step 5 — LLM Response:** The LLM returns a response based solely on the context provided in the assembled prompt.

**Step 6 — Writing Back:** The LLM's output can be persisted back to the filesystem as a new file (e.g., a tutoring session log, a generated explanation, a practice problem). This write-back can be handled automatically by the application, or manually by the student creating a new entry. Future meta-files can then reference this output, enabling cumulative memory over time.

# **5\. Privacy and Trust Model**

The system is designed around a deliberate distrust of LLMs as data custodians. The key principle: LLMs should receive only what is needed, assembled locally, and transmitted by choice.

* The LLM never has direct access to the filesystem. It cannot query, browse, or request additional data beyond what is in the assembled prompt.

* The teacher authors the meta-files and therefore controls the retrieval logic. This places a trusted human — with pedagogical context — in the role of deciding what the AI tutor can know.

* Filesystem access is held by the Compiler, not by a cloud service. Revoking the Compiler's access is sufficient to fully cut off AI data access.

* The system is compatible with fully offline or air-gapped deployments. If the user chooses to copy-paste the prompt manually, no automated data transmission occurs at all.

* Because the assembled prompt is inspectable before it is sent, users can review exactly what the LLM will see.

# **6\. Stakeholders and Their Roles**

**Teacher:** Authors meta-files that define the retrieval logic for their course. Determines what student data is relevant for different types of AI-assisted interactions. Does not need technical expertise — meta-files are human-readable Markdown.

**Student:** Owns their filesystem. Interacts with the tutor via the application. May author personal meta-files for self-directed use. Controls Compiler access permissions.

**Compiler:** Trusted software component (either local, or a vetted cloud provider). Has temporary, revocable filesystem access. Executes meta-file logic at query time. Produces the assembled prompt.

**LLM / AI Provider:** Untrusted external service. Receives only the assembled prompt. Has no persistent access to student data. Can be swapped or replaced without system redesign.

**Application:** Optional orchestration layer. Can automate prompt delivery and write-back. The system is designed to work without it — manual use is a first-class mode.

# **7\. Key System Properties for the Designer**

The following properties should be emphasized in both the slides and the architecture diagram:

* Filesystem-centric: Everything revolves around the filesystem. It is the canonical data store and the trust boundary.

* Separation of concerns: Data storage, retrieval logic, prompt assembly, and LLM inference are distinct, decoupled stages.

* Human-in-the-loop authoring: Teachers write the retrieval logic. AI does not determine what context it receives.

* Portable by design: Any LLM can be used. The system is not locked to a specific provider or API.

* Privacy by architecture: Data minimization is structural, not policy-based. The LLM cannot receive more than the meta-file specifies.

* Revocable access: Compiler permissions can be withdrawn at any time without data loss.

* Cumulative memory: Write-back to the filesystem enables memory to accumulate over time, entirely under user control.

# **8\. Suggested Diagram Structure**

For the architecture diagram, the following components and flows should be represented:

## **Components (nodes)**

* Filesystem (central, prominent — this is the hub of the system)

* Meta-Files (within or adjacent to the filesystem)

* Compiler (between the filesystem and the LLM boundary)

* Assembled Prompt (output of the Compiler, input to the LLM)

* LLM / AI Provider (external, visually separated from the local environment)

* Application (optional wrapper, shown as surrounding or orchestrating the flow)

* Student and Teacher (as actors, external to the system boundary)

## **Flows (edges)**

* Teacher → Meta-Files: authors / updates

* Student → Application/Compiler: submits query

* Compiler → Filesystem: reads (scoped, revocable access)

* Compiler → Meta-Files: reads template

* Compiler → Assembled Prompt: produces

* Assembled Prompt → LLM: sent (manual or automated)

* LLM → Application/Student: returns response

* Application/Student → Filesystem: writes back response

## **Visual Emphasis**

* Draw a clear boundary around the local environment (filesystem \+ Compiler \+ meta-files). The LLM sits outside this boundary.

* The trust boundary should be visually obvious — perhaps a dashed border or a shaded region.

* Show the Compiler as a gate or intermediary, not a passive pipe.

* The write-back arrow from LLM output to the filesystem closes the memory loop and should be highlighted.

