-- FixFlow Core Database Initialization Schema (PostgreSQL for Supabase)
-- Target: Supabase SQL Editor / Migration File
-- Localized for Nigerian Repair Hub Operations

-- ==========================================
-- 1. Create Enums & Extensions
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE repair_status AS ENUM (
    'Intake',
    'Assigned',
    'Repairing',
    'QA',
    'Ready',
    'Collected'
);

CREATE TYPE b2b_payment_status AS ENUM (
    'Pending',
    'Paid',
    'Failed'
);

-- ==========================================
-- 2. Create Core Tables
-- ==========================================

-- A. Technicians (Engineers List)
CREATE TABLE technicians (
    tech_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    specialization VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- B. Inventory & Spare Parts Catalog
CREATE TABLE inventory (
    part_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    part_name VARCHAR(255) NOT NULL UNIQUE,
    qty_in_stock INTEGER NOT NULL DEFAULT 0,
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    threshold_alert INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Constraint: Prevent negative stock levels
    CONSTRAINT check_positive_stock CHECK (qty_in_stock >= 0)
);

-- C. Master Repairs Ledger
CREATE TABLE repairs (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(50) NOT NULL,
    device_info VARCHAR(255) NOT NULL,
    primary_tech_id UUID REFERENCES technicians(tech_id) ON DELETE SET NULL,
    current_tech_id UUID REFERENCES technicians(tech_id) ON DELETE SET NULL,
    handover_logs TEXT NOT NULL DEFAULT '',
    status repair_status NOT NULL DEFAULT 'Intake',
    total_billing NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    checked_in_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- D. Spare Parts Allocation & Retail Procurement Logs
CREATE TABLE parts_log (
    record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES repairs(job_id) ON DELETE CASCADE,
    part_id UUID NOT NULL REFERENCES inventory(part_id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL DEFAULT 1,
    allocated_to UUID REFERENCES technicians(tech_id) ON DELETE SET NULL,
    is_retail_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    retail_source VARCHAR(255) DEFAULT NULL,
    purchase_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Constraints
    CONSTRAINT check_qty_positive CHECK (qty > 0)
);

-- E. B2B Wholesale Tools & Spares Sales Ledger
CREATE TABLE b2b_sales (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_hub_name VARCHAR(255) NOT NULL,
    buyer_phone VARCHAR(50) NOT NULL,
    part_id UUID NOT NULL REFERENCES inventory(part_id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL DEFAULT 1,
    price_charged NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_status b2b_payment_status NOT NULL DEFAULT 'Pending',
    sold_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Constraints
    CONSTRAINT check_sales_qty_positive CHECK (qty > 0)
);

-- F. Wholesale receipts restock log (Supply Intake)
CREATE TABLE wholesale_receipts (
    import_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_name VARCHAR(255) NOT NULL,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    items_parsed TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 3. Optimization Indices
-- ==========================================
CREATE INDEX idx_repairs_client_phone ON repairs(client_phone);
CREATE INDEX idx_repairs_status ON repairs(status);
CREATE INDEX idx_parts_log_job ON parts_log(job_id);
CREATE INDEX idx_b2b_sales_buyer ON b2b_sales(buyer_hub_name);

-- ==========================================
-- 4. Automated Database Triggers & Automations
-- ==========================================

-- Trigger Function A: Automatically deduct stock when part is allocated in parts_log
CREATE OR REPLACE FUNCTION func_allocate_part_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Deduct stock if it is NOT an ad-hoc local retail purchase
    IF NEW.is_retail_purchase = FALSE THEN
        UPDATE inventory
        SET qty_in_stock = qty_in_stock - NEW.qty
        WHERE part_id = NEW.part_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_parts_log_allocation
AFTER INSERT ON parts_log
FOR EACH ROW
EXECUTE FUNCTION func_allocate_part_stock();


-- Trigger Function B: Automatically deduct stock when part is sold in B2B wholesale
CREATE OR REPLACE FUNCTION func_allocate_b2b_sales_stock()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE inventory
    SET qty_in_stock = qty_in_stock - NEW.qty
    WHERE part_id = NEW.part_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_b2b_sales_allocation
AFTER INSERT ON b2b_sales
FOR EACH ROW
EXECUTE FUNCTION func_allocate_b2b_sales_stock();


-- Trigger Function C: Automatically log custody handover history when current_tech is updated
CREATE OR REPLACE FUNCTION func_log_handover_history()
RETURNS TRIGGER AS $$
DECLARE
    old_tech_name VARCHAR(255);
    new_tech_name VARCHAR(255);
BEGIN
    IF OLD.current_tech_id IS DISTINCT FROM NEW.current_tech_id THEN
        -- Get old technician name
        SELECT name INTO old_tech_name FROM technicians WHERE tech_id = OLD.current_tech_id;
        IF old_tech_name IS NULL THEN old_tech_name := 'Reception (Secretary)'; END IF;
        
        -- Get new technician name
        SELECT name INTO new_tech_name FROM technicians WHERE tech_id = NEW.current_tech_id;
        IF new_tech_name IS NULL THEN new_tech_name := 'Unassigned'; END IF;
        
        -- Append to handover log
        NEW.handover_logs := OLD.handover_logs || 
            '[' || timezone('utc'::text, now())::text || '] ' || 
            old_tech_name || ' -> ' || new_tech_name || E'\n';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_repairs_handover_history
BEFORE UPDATE OF current_tech_id ON repairs
FOR EACH ROW
EXECUTE FUNCTION func_log_handover_history();
