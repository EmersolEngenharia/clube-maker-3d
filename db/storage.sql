-- Add only the club's private bucket; do not alter existing Emersoft buckets.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('maker3d-projects','maker3d-projects',false,10485760,ARRAY['application/octet-stream']);
-- No anon/authenticated policies are added. Downloads go through the app's authorization.
