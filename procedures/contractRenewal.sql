DELIMITER //

CREATE PROCEDURE RenewContract(
    IN p_contract_id VARCHAR(36),
    IN p_new_start_date DATE,
    IN p_new_end_date DATE,
    IN p_new_value DECIMAL(15,2),
    IN p_renewal_terms TEXT,
    IN p_updated_by VARCHAR(36)
)
BEGIN
    DECLARE v_vendor_id VARCHAR(36);
    DECLARE v_old_contract_number VARCHAR(50);
    DECLARE v_new_contract_id VARCHAR(36);
    DECLARE v_vendor_rating DECIMAL(3,2);
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Failed to renew contract';
    END;

    START TRANSACTION;

    -- Get existing contract details
    SELECT vendor_id, contract_number 
    INTO v_vendor_id, v_old_contract_number
    FROM contracts 
    WHERE id = p_contract_id;

    -- Check if contract exists
    IF v_vendor_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Contract not found';
    END IF;

    -- Get vendor's current performance rating
    SELECT AVG(rating) INTO v_vendor_rating
    FROM vendor_performances
    WHERE vendor_id = v_vendor_id
    AND created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 1 YEAR);

    -- Check vendor rating threshold
    IF v_vendor_rating < 3.0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Vendor performance rating below threshold for renewal';
    END IF;

    -- Generate new contract ID
    SET v_new_contract_id = UUID();

    -- Archive old contract
    UPDATE contracts 
    SET status = 'expired',
        updated_at = CURRENT_TIMESTAMP,
        updated_by = p_updated_by
    WHERE id = p_contract_id;

    -- Create new contract
    INSERT INTO contracts (
        id,
        vendor_id,
        contract_number,
        title,
        description,
        start_date,
        end_date,
        value,
        status,
        terms_conditions,
        renewal_terms,
        created_by,
        previous_contract_id
    )
    SELECT 
        v_new_contract_id,
        vendor_id,
        CONCAT(LEFT(contract_number, CHAR_LENGTH(contract_number)-2), 
               RIGHT(contract_number, 2) + 1), -- Increment contract number
        title,
        description,
        p_new_start_date,
        p_new_end_date,
        p_new_value,
        'active',
        terms_conditions,
        p_renewal_terms,
        p_updated_by,
        p_contract_id
    FROM contracts
    WHERE id = p_contract_id;

    -- Log contract renewal
    INSERT INTO audit_logs (
        event_type,
        entity_type,
        entity_id,
        description,
        created_at,
        created_by
    ) VALUES (
        'CONTRACT_RENEWAL',
        'contract',
        v_new_contract_id,
        CONCAT('Contract renewed from ', v_old_contract_number),
        CURRENT_TIMESTAMP,
        p_updated_by
    );

    -- Create renewal notification
    INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id
    )
    SELECT 
        u.id,
        'CONTRACT_RENEWAL',
        'Contract Renewed',
        CONCAT('Contract ', v_old_contract_number, ' has been renewed'),
        'contract',
        v_new_contract_id
    FROM users u
    WHERE u.role IN ('admin', 'procurement_manager');

    COMMIT;

    -- Return the new contract ID
    SELECT v_new_contract_id AS new_contract_id;
END //

DELIMITER ;