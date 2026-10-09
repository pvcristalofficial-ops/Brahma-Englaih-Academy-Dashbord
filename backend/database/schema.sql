-- Brahma English Academy - Dashboard schema (MySQL 5.7+ / MariaDB 10.3+)
-- Safe to run more than once: every statement is CREATE ... IF NOT EXISTS / INSERT IGNORE.
-- Nothing in this application ever issues DELETE on business tables; rows are archived/voided instead.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  phone         VARCHAR(15) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'counsellor',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  `key`      VARCHAR(60) NOT NULL,
  `value`    TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courses (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  fee         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  duration    VARCHAR(60) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per student enquiry.
-- phone_normalized is UNIQUE => the database itself refuses a duplicate enquiry,
-- even if two staff members press Save at the same second.
CREATE TABLE IF NOT EXISTS enquiries (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_name         VARCHAR(100) NOT NULL,
  parent_name          VARCHAR(100) NULL,
  phone                VARCHAR(15) NOT NULL,
  phone_normalized     CHAR(10) NOT NULL,
  alt_phone            VARCHAR(15) NULL,
  alt_phone_normalized CHAR(10) NULL,
  email                VARCHAR(150) NULL,
  city                 VARCHAR(80) NULL,
  qualification        VARCHAR(100) NULL,
  course_id            INT UNSIGNED NULL,
  source               VARCHAR(30) NOT NULL,
  campaign             VARCHAR(120) NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'new',
  interest_level       VARCHAR(10) NOT NULL DEFAULT 'warm',
  lost_reason          VARCHAR(60) NULL,
  assigned_to          INT UNSIGNED NULL,
  notes                TEXT NULL,
  enquiry_date         DATE NOT NULL,
  next_follow_up_date  DATE NULL,
  next_follow_up_time  TIME NULL,
  last_contact_at      DATETIME NULL,
  follow_up_count      INT UNSIGNED NOT NULL DEFAULT 0,
  admitted_at          DATETIME NULL,
  is_archived          TINYINT(1) NOT NULL DEFAULT 0,
  archived_at          DATETIME NULL,
  archived_by          INT UNSIGNED NULL,
  archive_reason       VARCHAR(255) NULL,
  version              INT UNSIGNED NOT NULL DEFAULT 1,
  idempotency_key      VARCHAR(64) NULL,
  created_by           INT UNSIGNED NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_enquiries_phone (phone_normalized),
  UNIQUE KEY uq_enquiries_idem (idempotency_key),
  KEY ix_enquiries_alt_phone (alt_phone_normalized),
  KEY ix_enquiries_due (is_archived, status, next_follow_up_date),
  KEY ix_enquiries_assigned (assigned_to),
  KEY ix_enquiries_source (source),
  KEY ix_enquiries_date (enquiry_date),
  CONSTRAINT fk_enq_course   FOREIGN KEY (course_id)   REFERENCES courses (id) ON DELETE RESTRICT,
  CONSTRAINT fk_enq_assigned FOREIGN KEY (assigned_to) REFERENCES users (id)   ON DELETE RESTRICT,
  CONSTRAINT fk_enq_created  FOREIGN KEY (created_by)  REFERENCES users (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every call / WhatsApp / visit is a permanent timeline row.
CREATE TABLE IF NOT EXISTS followups (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enquiry_id          BIGINT UNSIGNED NOT NULL,
  type                VARCHAR(20) NOT NULL,
  outcome             VARCHAR(30) NOT NULL,
  note                TEXT NULL,
  scheduled_for       DATE NULL,
  followed_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_follow_up_date DATE NULL,
  idempotency_key     VARCHAR(64) NULL,
  created_by          INT UNSIGNED NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_followups_idem (idempotency_key),
  KEY ix_followups_enquiry (enquiry_id, followed_at),
  KEY ix_followups_date (followed_at),
  CONSTRAINT fk_fu_enquiry FOREIGN KEY (enquiry_id) REFERENCES enquiries (id) ON DELETE RESTRICT,
  CONSTRAINT fk_fu_user    FOREIGN KEY (created_by) REFERENCES users (id)     ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Confirmed admissions. enquiry_id is UNIQUE => an enquiry can be admitted only once.
CREATE TABLE IF NOT EXISTS admissions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admission_no  VARCHAR(30) NOT NULL,
  enquiry_id    BIGINT UNSIGNED NOT NULL,
  student_name  VARCHAR(100) NOT NULL,
  parent_name   VARCHAR(100) NULL,
  phone         VARCHAR(15) NOT NULL,
  email         VARCHAR(150) NULL,
  address       VARCHAR(255) NULL,
  course_id     INT UNSIGNED NOT NULL,
  course_name   VARCHAR(120) NOT NULL,
  batch_timing  VARCHAR(80) NULL,
  admission_date DATE NOT NULL,
  start_date    DATE NULL,
  total_fee     DECIMAL(10,2) NOT NULL,
  discount      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_fee       DECIMAL(10,2) NOT NULL,
  paid_amount   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  next_due_date DATE NULL,
  status        VARCHAR(15) NOT NULL DEFAULT 'active',
  notes         VARCHAR(500) NULL,
  version       INT UNSIGNED NOT NULL DEFAULT 1,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admissions_no (admission_no),
  UNIQUE KEY uq_admissions_enquiry (enquiry_id),
  KEY ix_admissions_due (status, next_due_date),
  KEY ix_admissions_date (admission_date),
  CONSTRAINT fk_adm_enquiry FOREIGN KEY (enquiry_id) REFERENCES enquiries (id) ON DELETE RESTRICT,
  CONSTRAINT fk_adm_course  FOREIGN KEY (course_id)  REFERENCES courses (id)   ON DELETE RESTRICT,
  CONSTRAINT fk_adm_user    FOREIGN KEY (created_by) REFERENCES users (id)     ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One receipt per payment. Numbers are gap-free per financial year (see counters).
-- Receipts are never deleted: a mistaken one is VOIDED with a reason.
CREATE TABLE IF NOT EXISTS receipts (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_no      VARCHAR(40) NOT NULL,
  admission_id    BIGINT UNSIGNED NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  payment_date    DATE NOT NULL,
  payment_mode    VARCHAR(20) NOT NULL,
  reference_no    VARCHAR(80) NULL,
  towards         VARCHAR(160) NOT NULL,
  balance_after   DECIMAL(10,2) NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'valid',
  void_reason     VARCHAR(255) NULL,
  voided_by       INT UNSIGNED NULL,
  voided_at       DATETIME NULL,
  idempotency_key VARCHAR(64) NULL,
  received_by     INT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_receipts_no (receipt_no),
  UNIQUE KEY uq_receipts_idem (idempotency_key),
  KEY ix_receipts_admission (admission_id),
  KEY ix_receipts_date (payment_date),
  CONSTRAINT fk_rcp_admission FOREIGN KEY (admission_id) REFERENCES admissions (id) ON DELETE RESTRICT,
  CONSTRAINT fk_rcp_user      FOREIGN KEY (received_by)  REFERENCES users (id)      ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atomic sequence counters (receipt / admission numbers).
CREATE TABLE IF NOT EXISTS counters (
  name  VARCHAR(40) NOT NULL,
  value INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who changed what, when. Written in the same transaction as the change.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(40) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id   BIGINT UNSIGNED NULL,
  summary     VARCHAR(255) NULL,
  old_values  LONGTEXT NULL,
  new_values  LONGTEXT NULL,
  ip          VARCHAR(45) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_entity (entity_type, entity_id),
  KEY ix_audit_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  k            VARCHAR(150) NOT NULL,
  hits         INT UNSIGNED NOT NULL DEFAULT 0,
  window_start DATETIME NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (`key`, `value`) VALUES
  ('academy_name',    'Brahma English Academy'),
  ('academy_tagline', 'Learn. Speak. Succeed.'),
  ('academy_address', ''),
  ('academy_phone',   ''),
  ('academy_email',   ''),
  ('academy_website', 'www.brahmaenglishacademy.com'),
  ('academy_gstin',   ''),
  ('receipt_prefix',  'BEA'),
  ('receipt_terms',   '1. Fees once paid are non-refundable and non-transferable.\n2. Please keep this receipt safe for future reference.\n3. Batch timings are subject to change with prior notice.'),
  ('stale_days',      '7');

INSERT IGNORE INTO courses (name, fee, duration) VALUES
  ('Spoken English', 0, ''),
  ('Basic English Grammar', 0, ''),
  ('Advanced Spoken English', 0, ''),
  ('IELTS / PTE Preparation', 0, ''),
  ('Kids English (School Students)', 0, ''),
  ('Personality Development', 0, ''),
  ('Interview & Communication Skills', 0, ''),
  ('Business English', 0, '');
