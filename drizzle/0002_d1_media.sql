CREATE TABLE `media_chunks` (
	`object_key` text NOT NULL,
	`position` integer NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`object_key`, `position`),
	FOREIGN KEY (`object_key`) REFERENCES `media_objects`(`key`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_chunk_size" CHECK(typeof("media_chunks"."data")='blob' AND length("media_chunks"."data") BETWEEN 1 AND 131072),
	CONSTRAINT "media_chunk_position" CHECK("media_chunks"."position" BETWEEN 0 AND 39)
);
--> statement-breakpoint
CREATE TABLE `media_objects` (
	`key` text PRIMARY KEY NOT NULL,
	`byte_length` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`sha256` text NOT NULL,
	`http_metadata` text NOT NULL,
	`custom_metadata` text NOT NULL,
	`uploaded` text NOT NULL,
	`source_etag` text,
	`storage_bytes` integer NOT NULL,
	CONSTRAINT "media_key_size" CHECK(length(CAST("media_objects"."key" AS BLOB)) BETWEEN 1 AND 1024),
	CONSTRAINT "media_object_size" CHECK("media_objects"."byte_length" BETWEEN 0 AND 5242880 AND "media_objects"."chunk_count"=("media_objects"."byte_length"+131071)/131072),
	CONSTRAINT "media_hash_size" CHECK(length("media_objects"."sha256")=64),
	CONSTRAINT "media_metadata_valid" CHECK(json_valid("media_objects"."http_metadata") AND json_valid("media_objects"."custom_metadata") AND length(CAST("media_objects"."http_metadata" AS BLOB))+length(CAST("media_objects"."custom_metadata" AS BLOB))<=32768),
	CONSTRAINT "media_storage_accounting" CHECK("media_objects"."storage_bytes"="media_objects"."byte_length"+length(CAST("media_objects"."key" AS BLOB))*(1+"media_objects"."chunk_count"*2)+length(CAST("media_objects"."http_metadata" AS BLOB))+length(CAST("media_objects"."custom_metadata" AS BLOB))+length(CAST(coalesce("media_objects"."source_etag",'') AS BLOB))+4096+"media_objects"."chunk_count"*128)
);
--> statement-breakpoint
CREATE TABLE `media_storage` (
	`id` integer PRIMARY KEY NOT NULL,
	`used_bytes` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "media_storage_singleton" CHECK("media_storage"."id"=1),
	CONSTRAINT "media_storage_budget" CHECK("media_storage"."used_bytes">=0 AND "media_storage"."used_bytes"<=104857600)
);
--> statement-breakpoint
INSERT INTO media_storage (id,used_bytes) VALUES (1,0);
--> statement-breakpoint
CREATE TRIGGER media_reserve_storage BEFORE INSERT ON media_objects
BEGIN
 SELECT (CASE WHEN EXISTS (SELECT 1 FROM media_objects WHERE key=NEW.key)
   THEN RAISE(ABORT,'MEDIA_KEY_EXISTS') END);
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM media_storage WHERE id=1 AND used_bytes+NEW.storage_bytes<=104857600)
   THEN RAISE(ABORT,'MEDIA_STORAGE_LIMIT') END);
 UPDATE media_storage SET used_bytes=used_bytes+NEW.storage_bytes WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER media_release_storage AFTER DELETE ON media_objects
BEGIN
 UPDATE media_storage SET used_bytes=used_bytes-OLD.storage_bytes WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER media_objects_immutable BEFORE UPDATE ON media_objects
BEGIN
 SELECT RAISE(ABORT,'Media objects are immutable; use a new image key');
END;
--> statement-breakpoint
CREATE TRIGGER media_chunks_immutable BEFORE UPDATE ON media_chunks
BEGIN
 SELECT RAISE(ABORT,'Media chunks are immutable; use a new image key');
END;
--> statement-breakpoint
CREATE TRIGGER media_chunk_shape BEFORE INSERT ON media_chunks
BEGIN
 SELECT (CASE WHEN NOT EXISTS (
   SELECT 1 FROM media_objects WHERE key=NEW.object_key AND NEW.position<chunk_count
     AND length(NEW.data)=min(131072,byte_length-NEW.position*131072)
 ) THEN RAISE(ABORT,'Invalid media chunk length or position') END);
END;
