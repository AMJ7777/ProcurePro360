DELIMITER //

-- Trigger before inserting new purchase order
CREATE TRIGGER before_purchase_order_insert
BEFORE INSERT ON purchase_orders
FOR EACH ROW
BEGIN
    DECLARE budget_available DECIMAL(15,2);
    DECLARE department_budget_id VARCHAR(36);
    DECLARE threshold_percentage DECIMAL(5,2);
    
    -- Get the current department budget
    SELECT id, remaining_amount 
    INTO department_budget_id, budget_available
    FROM budgets 
    WHERE department_id = NEW.department_id 
    AND fiscal_year = YEAR(NEW.created_at)
    AND status = 'active'
    LIMIT 1;
    
    -- Check if budget exists
    IF department_budget_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No active budget found for department';
    END IF;
    
    -- Check if sufficient budget is available
    IF NEW.total_amount > budget_available THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Insufficient budget for purchase order';
    END IF;
    
    -- Calculate remaining budget percentage
    SET threshold_percentage = ((budget_available - NEW.total_amount) / budget_available) * 100;
    
    -- Create alert if budget falls below threshold
    IF threshold_percentage < 20 THEN
        INSERT INTO notifications (
            type,
            title,
            message,
            related_entity_type,
            related_entity_id,
            is_read,
            created_at
        )
        SELECT 
            'BUDGET_ALERT',
            'Low Budget Alert',
            CONCAT('Department budget falling below 20%. Remaining: ', 
                  FORMAT(budget_available - NEW.total_amount, 2)),
            'budget',
            department_budget_id,
            0,
            CURRENT_TIMESTAMP;
    END IF;
END//

-- Trigger after inserting purchase order
CREATE TRIGGER after_purchase_order_insert
AFTER INSERT ON purchase_orders
FOR EACH ROW
BEGIN
    -- Update budget remaining amount
    UPDATE budgets 
    SET 
        remaining_amount = remaining_amount - NEW.total_amount,
        updated_at = CURRENT_TIMESTAMP
    WHERE department_id = NEW.department_id 
    AND fiscal_year = YEAR(NEW.created_at)
    AND status = 'active';
    
    -- Log the transaction
    INSERT INTO budget_transactions (
        budget_id,
        transaction_type,
        amount,
        reference_type,
        reference_id,
        created_at
    )
    SELECT 
        id,
        'DEBIT',
        NEW.total_amount,
        'purchase_order',
        NEW.id,
        CURRENT_TIMESTAMP
    FROM budgets
    WHERE department_id = NEW.department_id 
    AND fiscal_year = YEAR(NEW.created_at)
    AND status = 'active';
END//

-- Trigger before updating purchase order
CREATE TRIGGER before_purchase_order_update
BEFORE UPDATE ON purchase_orders
FOR EACH ROW
BEGIN
    DECLARE budget_available DECIMAL(15,2);
    DECLARE amount_difference DECIMAL(15,2);
    
    -- Only check budget if amount is being increased
    IF NEW.total_amount > OLD.total_amount THEN
        SET amount_difference = NEW.total_amount - OLD.total_amount;
        
        -- Get available budget
        SELECT remaining_amount INTO budget_available
        FROM budgets 
        WHERE department_id = NEW.department_id 
        AND fiscal_year = YEAR(NEW.updated_at)
        AND status = 'active';
        
        -- Check if sufficient budget is available
        IF amount_difference > budget_available THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Insufficient budget for purchase order update';
        END IF;
    END IF;
END//

-- Trigger after updating purchase order
CREATE TRIGGER after_purchase_order_update
AFTER UPDATE ON purchase_orders
FOR EACH ROW
BEGIN
    DECLARE amount_difference DECIMAL(15,2);
    
    -- Calculate amount difference
    SET amount_difference = NEW.total_amount - OLD.total_amount;
    
    -- Only update budget if amount has changed
    IF amount_difference != 0 THEN
        -- Update budget remaining amount
        UPDATE budgets 
        SET 
            remaining_amount = remaining_amount - amount_difference,
            updated_at = CURRENT_TIMESTAMP
        WHERE department_id = NEW.department_id 
        AND fiscal_year = YEAR(NEW.updated_at)
        AND status = 'active';
        
        -- Log the transaction
        INSERT INTO budget_transactions (
            budget_id,
            transaction_type,
            amount,
            reference_type,
            reference_id,
            created_at
        )
        SELECT 
            id,
            CASE 
                WHEN amount_difference > 0 THEN 'DEBIT'
                ELSE 'CREDIT'
            END,
            ABS(amount_difference),
            'purchase_order_update',
            NEW.id,
            CURRENT_TIMESTAMP
        FROM budgets
        WHERE department_id = NEW.department_id 
        AND fiscal_year = YEAR(NEW.updated_at)
        AND status = 'active';
    END IF;
END//

DELIMITER ;