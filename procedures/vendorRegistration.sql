DELIMITER //

CREATE PROCEDURE RegisterVendor(
    IN p_company_name VARCHAR(100),
    IN p_contact_person VARCHAR(100),
    IN p_email VARCHAR(100),
    IN p_phone VARCHAR(20),
    IN p_address TEXT,
    IN p_registration_number VARCHAR(50),
    IN p_tax_id VARCHAR(50),
    IN p_service_categories JSON,
    IN p_certifications JSON
)
BEGIN
    DECLARE v_vendor_id VARCHAR(36);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Failed to register vendor';
    END;

    START TRANSACTION;

    -- Check if vendor already exists
    IF EXISTS (SELECT 1 FROM vendors WHERE email = p_email OR registration_number = p_registration_number) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Vendor with this email or registration number already exists';
    END IF;

    -- Generate UUID for vendor
    SET v_vendor_id = UUID();

    -- Insert new vendor
    INSERT INTO vendors (
        id,
        company_name,
        contact_person,
        email,
        phone,
        address,
        registration_number,
        tax_id,
        service_categories,
        certifications,
        status,
        created_at
    ) VALUES (
        v_vendor_id,
        p_company_name,
        p_contact_person,
        p_email,
        p_phone,
        p_address,
        p_registration_number,
        p_tax_id,
        p_service_categories,
        p_certifications,
        'active',
        CURRENT_TIMESTAMP
    );

    -- Insert initial performance record
    INSERT INTO vendor_performances (
        vendor_id,
        rating,
        category,
        review_text,
        reviewed_by
    ) VALUES (
        v_vendor_id,
        0.00,
        'overall',
        'Initial registration',
        (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
    );

    -- Log the registration
    INSERT INTO audit_logs (
        event_type,
        entity_type,
        entity_id,
        description,
        created_at
    ) VALUES (
        'VENDOR_REGISTRATION',
        'vendor',
        v_vendor_id,
        CONCAT('New vendor registered: ', p_company_name),
        CURRENT_TIMESTAMP
    );

    COMMIT;

    -- Return the new vendor ID
    SELECT v_vendor_id AS vendor_id;
END //

DELIMITER ;