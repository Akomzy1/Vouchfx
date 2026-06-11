-- Migration 007: add breakeven_applied flag to trades
--
-- Tracks whether the drawdown-guardian has already moved this leg's SL
-- to breakeven (entry price) after TP1 hit. Prevents double-application
-- on every subsequent job.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS breakeven_applied BOOLEAN NOT NULL DEFAULT FALSE;
