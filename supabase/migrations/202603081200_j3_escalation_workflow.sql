-- Migration: Add fields to conversations for Escalation Workflow (J3)

-- 1. Create enum for escalation status
CREATE TYPE public.escalation_status AS ENUM ('open', 'pending', 'resolved');

-- 2. Add assignment, escalation status, and SLA to conversations
ALTER TABLE public.conversations
  ADD COLUMN assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN escalation_status public.escalation_status,
  ADD COLUMN sla_breach_at timestamptz;

-- 3. Add an index for fetching unresolved/escalated items
CREATE INDEX idx_conversations_escalation_status ON public.conversations(escalation_status) WHERE escalation_status IN ('open', 'pending');
CREATE INDEX idx_conversations_sla_breach_at ON public.conversations(sla_breach_at);

-- Add comments for documentation
COMMENT ON COLUMN public.conversations.assigned_to IS 'Operator assigned to this escalated conversation (UUID references auth.users)';
COMMENT ON COLUMN public.conversations.escalation_status IS 'Current escalation state. Null if not escalated.';
COMMENT ON COLUMN public.conversations.sla_breach_at IS 'Timestamp when the SLA for this escalation is breached.';
