package com.example.equipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Import(EquipmentRollbackTest.DatabaseConfiguration.class)
class EquipmentRollbackTest {
    @Autowired EquipmentRepository repository;
    @Autowired WriteFailure failure;

    enum Mutation { INSERT, UPDATE, DELETE }

    @BeforeEach
    void reset() {
        failure.clear();
        repository.reset();
        // A test-managed transaction would hide a missing application transaction.
        assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
    }

    @ParameterizedTest(name = "{0}: SQL実行後の障害で全データが元に戻る")
    @EnumSource(Mutation.class)
    void rollsBackAWriteWhenTheDatabaseFailsAfterExecutingSql(Mutation mutation) {
        var before = repository.list();
        failure.arm(mutation);

        assertThatThrownBy(() -> mutate(mutation, before.get(0).id()))
            .isInstanceOf(DataAccessException.class)
            .hasRootCauseMessage("Injected failure after successful SQL write");

        // The real H2 statement changed one row before the injected exception.
        assertThat(failure.affectedRows).isEqualTo(1);
        // This read uses a new connection, after the application's call has exited.
        assertThat(repository.list()).containsExactlyElementsOf(before);
        assertThat(failure.autoCommitAtFailure).isFalse();
    }

    @ParameterizedTest(name = "{0}: 障害がなければ変更をコミットする")
    @EnumSource(Mutation.class)
    void commitsSuccessfulWrites(Mutation mutation) {
        var before = repository.list();
        long id = before.get(0).id();
        mutate(mutation, id);
        var after = repository.list();
        switch (mutation) {
            case INSERT -> {
                assertThat(after).hasSize(before.size() + 1);
                assertThat(after).extracting(EquipmentRepository.Equipment::name).contains("結合テスト備品");
            }
            case UPDATE -> {
                assertThat(after).hasSize(before.size());
                assertThat(after).filteredOn(item -> item.id() == id).singleElement()
                    .isEqualTo(new EquipmentRepository.Equipment(id, "結合テスト備品", "その他", 9, "貸出中"));
            }
            case DELETE -> {
                assertThat(after).hasSize(before.size() - 1);
                assertThat(after).extracting(EquipmentRepository.Equipment::id).doesNotContain(id);
            }
        }
    }

    private void mutate(Mutation mutation, long id) {
        var input = new EquipmentController.EquipmentInput("結合テスト備品", "その他", 9, "貸出中");
        switch (mutation) {
            case INSERT -> repository.insert(input);
            case UPDATE -> assertThat(repository.update(id, input)).isTrue();
            case DELETE -> assertThat(repository.delete(id)).isTrue();
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class DatabaseConfiguration {
        @Bean WriteFailure writeFailure() { return new WriteFailure(); }

        @Bean DataSource dataSource(WriteFailure failure) {
            var realDatabase = new DriverManagerDataSource("jdbc:h2:mem:rollback-tests;DB_CLOSE_DELAY=-1", "sa", "");
            return new DelegatingDataSource(realDatabase) {
                @Override public Connection getConnection() throws SQLException {
                    return failure.wrap(super.getConnection());
                }
                @Override public Connection getConnection(String username, String password) throws SQLException {
                    return failure.wrap(super.getConnection(username, password));
                }
            };
        }
    }

    // Test-only fault injection. Production has no failure endpoint or switch.
    static class WriteFailure {
        private Mutation armed;
        int affectedRows;
        boolean autoCommitAtFailure;

        void clear() { armed = null; affectedRows = 0; autoCommitAtFailure = true; }
        void arm(Mutation mutation) { clear(); armed = mutation; }

        Connection wrap(Connection connection) {
            return (Connection) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] { Connection.class },
                (proxy, method, args) -> {
                    Object result = invoke(method, connection, args);
                    if (method.getName().equals("prepareStatement") && result instanceof PreparedStatement statement) {
                        String sql = (String) args[0];
                        return Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] { PreparedStatement.class },
                            (statementProxy, statementMethod, statementArgs) -> {
                                Object statementResult = invoke(statementMethod, statement, statementArgs);
                                if (statementMethod.getName().equals("executeUpdate") && armed != null && sql.startsWith(armed.name())) {
                                    affectedRows = (Integer) statementResult;
                                    autoCommitAtFailure = connection.getAutoCommit();
                                    armed = null;
                                    throw new SQLException("Injected failure after successful SQL write");
                                }
                                return statementResult;
                            });
                    }
                    return result;
                });
        }

        private static Object invoke(Method method, Object target, Object[] args) throws Throwable {
            try { return method.invoke(target, args); }
            catch (InvocationTargetException exception) { throw exception.getCause(); }
        }
    }
}
