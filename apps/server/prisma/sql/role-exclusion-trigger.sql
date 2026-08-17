-- operator/approver 互斥触发器（数据库兜底闸）。见 ADR-002。
-- 定位：应用层 UserRoleService.assignRole 事务是主校验；此触发器兜住
-- “绕过应用直接写库”（DBA、迁移脚本）的路径，保证任何写入都挡得住。
--
-- 与源码 enterprise/auth/constraints.py 的 PG 触发器等价，改写为 MySQL 语法：
--   PG:  RAISE EXCEPTION       →  MySQL: SIGNAL SQLSTATE '45000'
--   PG:  $$ ... $$ plpgsql     →  MySQL: BEGIN ... END + DELIMITER
--
-- 应用方式：mysql 客户端（认 DELIMITER 指令）。见 apply-triggers.sh。
-- 注意：不能用 Prisma $executeRaw 灌——CREATE TRIGGER 不支持 prepared 协议(MySQL 1295)。

DELIMITER $$

DROP TRIGGER IF EXISTS trg_role_exclusion_insert$$
DROP TRIGGER IF EXISTS trg_role_exclusion_update$$

CREATE TRIGGER trg_role_exclusion_insert
BEFORE INSERT ON user_department_roles
FOR EACH ROW
BEGIN
  DECLARE conflicting VARCHAR(32);
  SET conflicting = NULL;

  IF NEW.role = 'OPERATOR' THEN
    SELECT role INTO conflicting FROM user_department_roles
    WHERE userId = NEW.userId AND departmentId = NEW.departmentId AND role = 'APPROVER' LIMIT 1;
  ELSEIF NEW.role = 'APPROVER' THEN
    SELECT role INTO conflicting FROM user_department_roles
    WHERE userId = NEW.userId AND departmentId = NEW.departmentId AND role = 'OPERATOR' LIMIT 1;
  END IF;

  IF conflicting IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Dual control violation: operator/approver mutually exclusive in same department';
  END IF;
END$$

CREATE TRIGGER trg_role_exclusion_update
BEFORE UPDATE ON user_department_roles
FOR EACH ROW
BEGIN
  DECLARE conflicting VARCHAR(32);
  SET conflicting = NULL;

  IF NEW.role = 'OPERATOR' THEN
    SELECT role INTO conflicting FROM user_department_roles
    WHERE userId = NEW.userId AND departmentId = NEW.departmentId AND role = 'APPROVER' LIMIT 1;
  ELSEIF NEW.role = 'APPROVER' THEN
    SELECT role INTO conflicting FROM user_department_roles
    WHERE userId = NEW.userId AND departmentId = NEW.departmentId AND role = 'OPERATOR' LIMIT 1;
  END IF;

  IF conflicting IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Dual control violation: operator/approver mutually exclusive in same department';
  END IF;
END$$

DELIMITER ;
