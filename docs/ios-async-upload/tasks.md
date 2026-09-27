# Implementation Plan: iOS-TextHarvester Async Upload

- [x] 1. Server-Side Foundation & Database
  - [Establish database schema capabilities for site isolation]
  - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.1 [Create site_code verification tests]
    - **Happy path**: Verify `storeMemorial` persists `site_code` correctly
    - **Unhappy path**: Verify database handles null/missing `site_code` gracefully (backward compat)
    - _Requirements: 3.1_

  - [x] 1.2 [Implement database migration and updates]
    - Add `site_code` column to `memorials` table
    - Update `database.js` `storeMemorial` function
    - Update schema initialization
    - _Requirements: 3.1_

  - [x] 1.3 [Write tests for Results filtering]
    - **Happy path**: Query by `site_code` returns matching records
    - **Unhappy path**: Query with non-existent `site_code` returns empty list
    - _Requirements: 3.2_

  - [x] 1.4 [Implement Results filtering logic]
    - Update retrieval functions in `database.js` to accept filter params
    - _Requirements: 3.2, 3.3_

- [x] 2. Server-Side API & Components
  - [Implement the API endpoints and logic to handle mobile uploads]
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2_

  - [x] 2.1 [Write tests for FilenameValidator]
    - **Happy path**: `cork-0001.jpg` parses to site `cork`
    - **Unhappy path**: `image.jpg`, `bad-format`, empty strings return validation errors
    - Verify strict mode behavior
    - _Requirements: 1.2, 3.4_

  - [x] 2.2 [Implement FilenameValidator]
    - Create `src/utils/filenameValidator.js`
    - Implement regex logic
    - _Requirements: 1.2_

  - [x] 2.3 [Write tests for MobileUploadHandler]
    - **Happy path**: Valid multipart upload -> Validation -> Queue Service -> 200 OK
    - **Unhappy path**: Invalid files, missing files, size limit exceeded -> 4xx Errors
    - **Unhappy path**: Queue service down -> 503 Error
    - Mock `IngestService` and `multer`
    - _Requirements: 1.1, 1.3, 2.1_

  - [x] 2.4 [Implement MobileUploadHandler & Routes]
    - Create `src/controllers/mobileUploadHandler.js`
    - Create `src/routes/mobileUploadRoutes.js`
    - Mount routes in `server.js`
    - Integration with `IngestService`
    - _Requirements: 1.1, 1.3, 2.1_

- [x] 3. Web UI Updates
  - [Enhance web interface to support mobile data]
  - _Requirements: 3.2, 3.3_

  - [x] 3.1 [Update Results Page]
    - Add "Mobile" source badge to data table
    - Add Site Code column/filter
    - _Requirements: 3.2, 3.3_

- [x] 4. Integration & Verification (Server Only)
  - [Verify the system works with manual API calls]
  - _Requirements: All_

  - [x] 4.1 [End-to-End Manual Test (Server)]
    - Test upload endpoint via CLI/curl
    - Verify processing and database persistence
    - Verify results appearance in Web UI

- [ ] 5. iOS Client Logic (Upload Service) [DEFERRED]
  - [Implement the robust upload client with retry logic]
  - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 5.1 [Write tests for UploadService retry logic]
    - **Happy path**: Successful upload, successful retry after 1 failure
    - **Unhappy path**: Max retries reached, 4xx error (no retry), network offline handling
    - Verify exponential backoff timing (mock timers)
    - _Requirements: 4.1, 4.2_

  - [ ] 5.2 [Implement UploadService]
    - Create `utils/uploadService.ts`
    - Implement `uploadPhoto` with backoff loop
    - Implement queue management
    - _Requirements: 4.1_

  - [ ] 5.3 [Write tests for UploadStore (Zustand)]
    - **Happy path**: State transitions (Pending -> Uploading -> Complete)
    - **Unhappy path**: Error state handling, reset functionality
    - Verify progress calculation logic
    - _Requirements: 5.1, 5.2_

  - [ ] 5.4 [Implement UploadStore]
    - Create `store/uploadStore.ts`
    - Define interfaces and state actions
    - _Requirements: 5.1, 5.2_

- [ ] 6. iOS Client UI [DEFERRED]
  - [Build the user interface for monitoring uploads]
  - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 6.1 [Implement Upload List Components]
    - Create `UploadStatusRow` component
    - Create `UploadProgressRing` component
    - Integrate with `UploadStore`
    - _Requirements: 5.1, 5.2_

  - [ ] 6.2 [Integrate into Export Screen]
    - Add "Upload to Server" button to `export.tsx`
    - Connect UI events to `UploadService` trigger
    - _Requirements: 5.1_
