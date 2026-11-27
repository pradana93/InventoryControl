-- Create audit_logs table for immutable audit trail
-- Tracks all data mutations across the system

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT now(),
    user_email TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'OPNAME', 'CONFIRM', 'TOGGLE')),
    table_name TEXT NOT NULL,
    record_id TEXT,
    old_values JSONB,
    new_values JSONB
);

-- Enable Row Level Security
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can INSERT audit logs
CREATE POLICY "Authenticated users can insert audit logs"
    ON audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy: Authenticated users can SELECT audit logs
CREATE POLICY "Authenticated users can select audit logs"
    ON audit_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only super-admin/manager can UPDATE audit logs
-- This assumes there's a users table with role column
-- We restrict UPDATE to users with role 'super-admin' or 'manager'
CREATE POLICY "Super-admin/manager can update audit logs"
    ON audit_logs
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.email = auth.email()
            AND users.role IN ('super-admin', 'manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.email = auth.email()
            AND users.role IN ('super-admin', 'manager')
        )
    );

-- Policy: Only super-admin/manager can DELETE audit logs
CREATE POLICY "Super-admin/manager can delete audit logs"
    ON audit_logs
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.email = auth.email()
            AND users.role IN ('super-admin', 'manager')
        )
    );

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON audit_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);

-- Comment for documentation
COMMENT ON TABLE audit_logs IS 'Immutable audit trail for all data mutations. INSERT allowed for authenticated users; UPDATE/DELETE restricted to super-admin/manager only.';
COMMENT ON COLUMN audit_logs.action IS 'Type of action: INSERT, UPDATE, DELETE, OPNAME, CONFIRM, TOGGLE';
COMMENT ON COLUMN audit_logs.old_values IS 'JSONB snapshot of record before change (null for INSERT)';
COMMENT ON COLUMN audit_logs.new_values IS 'JSONB snapshot of record after change (null for DELETE)';