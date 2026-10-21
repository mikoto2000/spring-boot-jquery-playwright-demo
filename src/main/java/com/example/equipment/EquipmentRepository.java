package com.example.equipment;

import java.util.List;
import java.util.Objects;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class EquipmentRepository implements ApplicationRunner {
    private final JdbcClient db;
    public EquipmentRepository(JdbcClient db) { this.db = db; }

    public record Equipment(long id, String name, String category, int quantity, String status) {}

    public List<Equipment> list() {
        return db.sql("SELECT * FROM equipment ORDER BY id").query(Equipment.class).list();
    }

    @Transactional
    public Equipment insert(EquipmentController.EquipmentInput input) {
        var keys = new GeneratedKeyHolder();
        db.sql("INSERT INTO equipment(name, category, quantity, status) VALUES (?, ?, ?, ?)")
            .params(input.name().strip(), input.category(), input.quantity(), input.status()).update(keys, "id");
        return input.toEquipment(Objects.requireNonNull(keys.getKey(), "Missing generated equipment ID").longValue());
    }

    @Transactional
    public boolean update(long id, EquipmentController.EquipmentInput input) {
        return db.sql("UPDATE equipment SET name=?, category=?, quantity=?, status=? WHERE id=?")
            .params(input.name().strip(), input.category(), input.quantity(), input.status(), id).update() > 0;
    }

    @Transactional
    public boolean delete(long id) {
        return db.sql("DELETE FROM equipment WHERE id=?").param(id).update() > 0;
    }

    @Transactional
    public void reset() {
        db.sql("DELETE FROM equipment").update();
        seed();
    }

    private void seed() {
        insert(new EquipmentController.EquipmentInput("会議室モニター", "PC・周辺機器", 3, "利用可能"));
        insert(new EquipmentController.EquipmentInput("ノートパソコン", "PC・周辺機器", 5, "貸出中"));
        insert(new EquipmentController.EquipmentInput("ホワイトボード", "オフィス用品", 2, "利用可能"));
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (db.sql("SELECT COUNT(*) FROM equipment").query(Long.class).single() == 0) seed();
    }
}
