I need help creating a comprehensive feature specification following a structured workflow. Please help me transform my rough feature idea into a detailed requirements document, design document, and implementation plan.

**Template References:**
- See `docs/templates/template-requirements.md` for requirements document structure
- See `docs/templates/template-design.md` for design document structure
- See `docs/templates/template-tasks.md` for implementation plan structure

**My Feature Idea:** Enable async upload of monument photos from the Historic Graves iOS Survey App to TextHarvester for OCR processing. Photos are uploaded with their filenames (containing sitecode-number), queued on the server, and processed.

**Instructions:**
1. First, create a requirements.md document (follow `docs/templates/template-requirements.md` structure):
   - Clear introduction summarizing the feature
   - Numbered requirements with user stories in format: "As a [role], I want [feature], so that [benefit]"
   - Detailed acceptance criteria in EARS format (WHEN/IF/THEN statements)
   - Include 3 happy path criteria (with both WHEN and IF statements)
   - Include 4 unhappy path criteria (errors, edge cases, failures, boundaries)
   - Consider edge cases, user experience, and technical constraints

2. After I approve the requirements, create a design.md document (follow `docs/templates/template-design.md` structure):
   - Overview and architecture section
   - Component and interface definitions
   - Data models and schemas
   - Test specifications for EACH component (define happy and unhappy path test cases)
   - Error handling strategy
   - Testing approach and test data structures
   - Include Mermaid diagrams where helpful

3. Finally, create a tasks.md implementation plan (follow `docs/templates/template-tasks.md` structure):
   - Numbered checkbox list (max 2 levels: tasks and sub-tasks)
   - Follow TEST-DRIVEN DEVELOPMENT: Write tests BEFORE implementation
   - Each task sequence: write tests (happy + unhappy paths) → implement → refactor
   - Tasks that build incrementally on previous work
   - Reference specific requirements from the requirements doc
   - Mark exploratory/integration tests as optional with "*" suffix (unit tests are required)
   - Test BOTH happy and unhappy paths in every unit test task
   - Ensure backward compatibility considerations

**Process Rules:**
- Ask for my explicit approval after each document before proceeding
- Make revisions based on my feedback before moving to next phase
- Don't skip ahead - complete each phase fully
- Focus on actionable, concrete implementation steps
- Maintain consistency between all three documents
- Emphasize test-driven development: tests define behavior, implementation follows
- Always test BOTH happy and unhappy paths
- Follow the structure and guidelines in the template files

Please start by creating the requirements document based on my feature idea above.
