DELIMITER //

-- Trigger for contracts nearing expiration
CREATE TRIGGER before_contract_update
BEFORE UPDATE ON contracts
FOR EACH ROW
BEGIN
    -- Check if contract status is being changed to active
    IF NEW.status = 'active' AND OLD.status != 'active' THEN
        -- Set the last_notification_date to NULL for new active contracts
        SET NEW.last_notification_date = NULL;
    END IF;
END//

-- Trigger to track contract modifications
CREATE TRIGGER after_contract_update
AFTER UPDATE ON contracts
FOR EACH ROW
BEGIN
    -- Log contract modifications
    INSERT INTO audit_logs (
        event_type,
        entity_type,
        entity_id,
        description,
        created_at
    ) VALUES (
        'CONTRACT_UPDATE',
        'contract',
        NEW.id,
        CONCAT('Contract updated: ', NEW.contract_number),
        CURRENT_TIMESTAMP
    );
END//

-- Event to check for contracts nearing expiration (runs daily)
CREATE EVENT contract_renewal_check
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    DECLARE v_contract_id VARCHAR(36);
    DECLARE v_vendor_id VARCHAR(36);
    DECLARE v_contract_number VARCHAR(50);
    DECLARE v_end_date DATE;
    DECLARE done INT DEFAULT FALSE;
    
    -- Cursor for contracts nearing expiration
    DECLARE contract_cursor CURSOR FOR
        SELECT c.id, c.vendor_id, c.contract_number, c.end_date
        FROM contracts c
        WHERE c.status = 'active'
        AND c.end_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 90 DAY)
        AND (c.last_notification_date IS NULL 
             OR c.last_notification_date < DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY));
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    OPEN contract_cursor;
    
    read_loop: LOOP
        FETCH contract_cursor INTO v_contract_id, v_vendor_id, v_contract_number, v_end_date;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- Create notification for procurement team
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
            'CONTRACT_EXPIRY',
            'Contract Expiration Alert',
            CONCAT('Contract ', v_contract_number, ' expires on ', v_end_date),
            'contract',
            v_contract_id,
            0,
            CURRENT_TIMESTAMP;
        
        -- Send email notifications to relevant users
        INSERT INTO email_queue (
            recipient_type,
            recipient_id,
            subject,
            content,
            status,
            created_at
        )
        SELECT 
            'user',
            u.id,
            CONCAT('Contract Expiration Alert - ', v_contract_number),
            CONCAT('Contract ', v_contract_number, ' with vendor ', 
                  (SELECT company_name FROM vendors WHERE id = v_vendor_id),
                  ' is expiring on ', v_end_date),
            'pending',
            CURRENT_TIMESTAMP
        FROM users u
        WHERE u.role IN ('procurement_manager', 'admin');
        
        -- Update last notification date
        UPDATE contracts 
        SET last_notification_date = CURRENT_DATE
        WHERE id = v_contract_id;
        
    END LOOP;
    
    CLOSE contract_cursor;
END//

DELIMITER ;