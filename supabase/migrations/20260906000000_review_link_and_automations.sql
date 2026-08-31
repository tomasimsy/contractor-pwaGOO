-- Company-wide "leave us a review" URL (Google/Yelp/etc.) used by the
-- new daily-automations cron's review-request email — sent 7 days
-- after an invoice is fully paid. Company-wide only (not per Business
-- Profile, unlike bcc_email/email templates): most contractors have
-- one review listing regardless of which brand profile billed the job.
-- Null = the review-request check simply skips sending rather than
-- emailing a broken/missing link.
alter table public.company_settings add column if not exists review_link text;

comment on column public.company_settings.review_link is
  'Company-wide "leave us a review" URL (e.g. Google Business/Yelp). Null = review-request automation skips sending.';
