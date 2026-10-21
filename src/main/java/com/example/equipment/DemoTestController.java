package com.example.equipment;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@Profile("e2e")
@RestController
public class DemoTestController {
    private final EquipmentRepository repository;
    public DemoTestController(EquipmentRepository repository) { this.repository = repository; }

    @PostMapping("/api/test/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reset() { repository.reset(); }
}
