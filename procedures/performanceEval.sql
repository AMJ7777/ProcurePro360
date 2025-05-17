DELIMITER //

CREATE PROCEDURE EvaluateVendorPerformance(
    IN p_vendor_id VARCHAR(36),
    IN p_contract_id VARCHAR(36),
    IN p_po_id VARCHAR(36),
    IN p_quality_rating DECIMAL(3,2),
    IN p_delivery_rating DECIMAL(3,2),
    IN p_communication_rating DECIMAL(3,2),
    IN p_pricing_rating DECIMAL(3,2),
    IN p_review_text TEXT,
    IN p_reviewed_by VARCHAR(36)
)
BEGIN
    DECLARE v_overall_rating DECIMAL(3,2);
    DECLARE v_previous_rating DECIMAL(3,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Failed to evaluate vendor performance';
    END;

    START TRANSACTION;

    -- Validate ratings
    IF p_quality_rating < 0 OR p_quality_rating > 5 OR
       p_delivery_rating < 0 OR p_delivery_rating > 5 OR
       p_communication_rating < 0 OR p_communication_rating > 5 OR
       p_pricing_rating < 0 OR p_pricing_rating > 5 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Rating must be between 0 and 5';
    END IF;

    -- Calculate overall rating
    SET v_overall_rating = (p_quality_rating + p_delivery_rating + p_communication_rating + p_pricing_rating) / 4;

    -- Insert quality rating
    INSERT INTO vendor_performances (
        vendor_id,
        contract_id,
        po_id,
        rating,
        category,
        review_text,
        reviewed_by
    ) VALUES (
        p_vendor_id,
        p_contract_id,
        p_po_id,
        p_quality_rating,
        'quality',
        p_review_text,
        p_reviewed_by
    );

    -- Insert delivery rating
    INSERT INTO vendor_performances (
        vendor_id,
        contract_id,
        po_id,
        rating,
        category,
        review_text,
        reviewed_by
    ) VALUES (
        p_vendor_id,
        p_contract_id,
        p_po_id,
        p_delivery_rating,
        'delivery',
        p_review_text,
        p_reviewed_by
    );

    -- Insert communication rating
    INSERT INTO vendor_performances (
        vendor_id,
        contract_id,
        po_id,
        rating,
        category,
        review_text,
        reviewed_by
    ) VALUES (
        p_vendor_id,
        p_contract_id,
        p_po_id,
        p_communication_rating,
        'communication',
        p_review_text,
        p_reviewed_by
    );

    -- Insert pricing rating
    INSERT INTO vendor_performances (
        vendor_id,
        contract_id,
        po_id,
        rating,
        category,
        review_text,
        reviewed_by
    ) VALUES (
        p_vendor_id,
        p_contract_id,
        p_po_id,
        p_pricing_rating,
        'pricing',
        p_review_text,
        p_reviewed_by
    );

    -- Insert overall rating
    INSERT INTO vendor_performances (
        vendor_id,
        contract_id,
        po_id,
        rating,
        category,
        review_text,
        reviewed_by
    ) VALUES (
        p_vendor_id,
        p_contract_id,
        p_po_id,
        v_overall_rating,
        'overall',
        p_review_text,
        p_reviewed_by
    );

    -- Update vendor's average rating
    UPDATE vendors v
    SET rating = (
        SELECT AVG(rating)
        FROM vendor_performances
        WHERE vendor_id = v.id
        AND category = 'overall'
        AND created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 1 YEAR)
    )
    WHERE id = p_vendor_id;

    -- Check if rating dropped significantly
    SELECT rating INTO v_previous_rating
    FROM vendors
    WHERE id = p_vendor_id;

    -- Create alert if rating dropped significantly
    IF v_overall_rating < v_previous_rating - 1 THEN
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
            'PERFORMANCE_ALERT',
            'Vendor Performance Alert',
            CONCAT('Significant rating drop for vendor: ', 
                  (SELECT company_name FROM vendors WHERE id = p_vendor_id)),
            'vendor',
            p_vendor_id
        FROM users u
        WHERE u.role IN ('admin', 'procurement_manager');
    END IF;

    -- Log the evaluation
    INSERT INTO audit_logs (
        event_type,
        entity_type,
        entity_id,
        description,
        created_at,
        created_by
    ) VALUES (
        'PERFORMANCE_EVALUATION',
        'vendor',
        p_vendor_id,
        CONCAT('Performance evaluation completed with overall rating: ', v_overall_rating),
        CURRENT_TIMESTAMP,
        p_reviewed_by
    );

    COMMIT;

    -- Return the evaluation results
    SELECT 
        v_overall_rating as overall_rating,
        p_quality_rating as quality_rating,
        p_delivery_rating as delivery_rating,
        p_communication_rating as communication_rating,
        p_pricing_rating as pricing_rating;
END //

DELIMITER ;