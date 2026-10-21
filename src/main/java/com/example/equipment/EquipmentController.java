package com.example.equipment;

import java.util.List;
import java.util.Map;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/equipment")
public class EquipmentController {
    private final EquipmentRepository repository;
    public EquipmentController(EquipmentRepository repository) { this.repository = repository; }

    public record EquipmentInput(
        @NotBlank @Size(max=80) String name,
        @NotNull @Pattern(regexp="PC・周辺機器|オフィス用品|その他") String category,
        @NotNull @Min(0) @Max(9999) Integer quantity,
        @NotNull @Pattern(regexp="利用可能|貸出中") String status
    ) {}

    @GetMapping
    public List<EquipmentRepository.Equipment> list() { return repository.list(); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, String> create(@Valid @RequestBody EquipmentInput input) {
        repository.insert(input);
        return Map.of("message", "備品を登録しました");
    }

    @PutMapping("/{id}")
    public Map<String, String> update(@PathVariable long id, @Valid @RequestBody EquipmentInput input) {
        if (!repository.update(id, input)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return Map.of("message", "備品を更新しました");
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        if (!repository.delete(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }
}
