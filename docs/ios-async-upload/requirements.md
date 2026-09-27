# Requirements Document

## Introduction

This feature enables asynchronous uploading of monument photos from the Historic Graves iOS Survey App to the TextHarvester web service for OCR processing. Currently, the iOS app operates offline, collecting geotagged photos and metadata. TextHarvester operates as a separate web service for extracting text from images.

This integration bridges the gap by allowing users to upload survey photos directly from the mobile app to the server. The photos are processed asynchronously by TextHarvester's AI-powered OCR pipeline. This streamlines the workflow, removing the need for manual file transfer and enabling automated transcription of inscriptions collected in the field.

## Requirements

### Requirement 1: Mobile Upload Endpoint

**User Story:** As a mobile app user, I want to upload monument photos to the server directly from the app, so that I don't have to manually transfer files to a computer first.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the client sends a POST request to `/api/mobile/upload` with a valid JPEG image and metadata THEN the system SHALL accept the file and return a 200 OK status.
2. WHEN a valid filename format `[site_code]-[number].jpg` is provided THEN the system SHALL parse and store the `site_code` correctly.
3. WHEN a file is successfully received THEN the system SHALL return a JSON response containing the file queue ID and status `queued`.

**Unhappy Path:**
4. WHEN an invalid file type (non-image) is uploaded THEN the system SHALL reject the request with a 400 Bad Request error.
5. WHEN the filename does not match the expected `site_code-number` pattern THEN the system SHALL reject the upload with a validation error.
6. IF the server disk storage is full THEN the system SHALL reject the upload with a 507 Insufficient Storage error.
7. IF the file size exceeds the configured limit (e.g., 50MB) THEN the system SHALL reject the request with a 413 Payload Too Large error.

### Requirement 2: Asynchronous Queueing

**User Story:** As a system administrator, I want uploaded files to be processed asynchronously, so that the mobile app doesn't have to wait for OCR to complete (which can take variable time).

#### Acceptance Criteria

**Happy Path:**
1. WHEN a file is uploaded via the mobile endpoint THEN the system SHALL add it to the existing `IngestService` with `source_type='monument_photo'`.
2. IF the file queue is empty WHEN a new file arrives THEN the system SHALL immediately spin up a worker to start processing.
3. WHEN multiple files are uploaded rapidly THEN the system SHALL process them according to the configured concurrency limit (default: 3).

**Unhappy Path:**
4. IF the queue service is down or unresponsive THEN the system SHALL return a 503 Service Unavailable error to the upload request.
5. WHEN a file fails to be added to the queue THEN the system SHALL log a structured error and alert the client.
6. IF the OCR provider (OpenAI/Anthropic) API is unreachable during processing THEN the system SHALL retry the processing operation up to the configured limit before failing.
7. IF a processing worker crashes THEN the system SHALL handle the failure gracefully and not crash the main server process.

### Requirement 3: Survey Isolation by Site Code

**User Story:** As a researcher, I want my survey data to be isolated by site code, so that I can view and export results specific to the graveyard I am working on.

#### Acceptance Criteria

**Happy Path:**
1. WHEN a photo with filename `cork-0001.jpg` is processed THEN the resulting memorial record SHALL have the `site_code` column set to `cork`.
2. WHEN requesting results via `/api/mobile/results/:siteCode` THEN the system SHALL return only records matching that site code.
3. WHEN searching for records via the CLI THEN the system SHALL allow filtering by `site_code`.

**Unhappy Path:**
4. IF a filename has no clear site code (e.g., `image.jpg`) THEN the system SHALL default `site_code` to `unknown` or reject the file based on strict mode settings.
5. WHEN a site code contains special characters or invalid formatting THEN the system SHALL sanitize it before database insertion.
6. IF a user requests results for a non-existent site code THEN the system SHALL return an empty list with a 200 OK status (not an error).
7. IF the site code parameter is missing from the results request THEN the system SHALL return a 400 Bad Request error.

### Requirement 4: Client-Side Retry Logic

**User Story:** As a mobile app user, I want the upload process to be robust against network interruptions, so that I don't lose data if my connection is spotty in the field.

#### Acceptance Criteria

**Happy Path:**
1. WHEN an upload fails due to a network error THEN the mobile client SHALL attempt to retry the upload.
2. IF a retry is triggered THEN the client SHALL wait for an exponentially increasing delay (e.g., 1s, 2s, 4s) before the next attempt.
3. WHEN an upload succeeds after a retry THEN the client SHALL mark the item as "Complete" and proceed to the next item.

**Unhappy Path:**
4. WHEN the maximum number of retries (3) is reached THEN the client SHALL mark the upload as "Failed" and stop retrying automatically.
5. IF the server returns a 4xx error (client error) THEN the client SHALL NOT retry and immediately mark the item as "Failed".
6. WHEN the network is completely unavailable THEN the client SHALL pause the queue until connectivity is restored.
7. IF the app is closed during a retry wait period THEN the retry state SHALL be preserved for the next session.

### Requirement 5: Progress Monitoring

**User Story:** As a mobile app user, I want to see the progress of my uploads, so that I know when it is safe to close the app or if action is needed.

#### Acceptance Criteria

**Happy Path:**
1. WHEN an upload batch is started THEN the UI SHALL display a progress indicator showing "X of Y files uploaded".
2. WHEN an individual file is uploading THEN the UI SHALL show its specific status (Uploading, Retrying, Complete).
3. WHEN all uploads are complete THEN the system SHALL display a completion summary.

**Unhappy Path:**
4. WHEN an upload fails THEN the UI SHALL clearly indicate which specific file failed.
5. IF the upload process stalls for more than a defined timeout THEN the UI SHALL show a "Connection Timeout" warning.
6. WHEN the user cancels an ongoing upload batch THEN the system SHALL stop all pending queue items immediately.
7. IF the app is backgrounded and foregrounded again, the progress UI SHALL reflect the current state without resetting to zero.
