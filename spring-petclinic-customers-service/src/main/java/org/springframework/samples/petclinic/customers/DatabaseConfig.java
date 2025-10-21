package org.springframework.samples.petclinic.customers;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;

/**
 * Database configuration for performance optimization
 * Addresses HSQLDB latency issues identified in AWS APM investigation
 */
@Configuration
@EnableTransactionManagement
public class DatabaseConfig {

    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.hikari")
    public HikariConfig hikariConfig() {
        HikariConfig config = new HikariConfig();
        
        // Performance optimizations for HSQLDB
        config.setMaximumPoolSize(20);
        config.setMinimumIdle(5);
        config.setConnectionTimeout(20000);
        config.setIdleTimeout(300000);
        config.setMaxLifetime(1200000);
        config.setLeakDetectionThreshold(60000);
        
        // HSQLDB specific optimizations to reduce INSERT latency
        config.setConnectionInitSql(
            "SET DATABASE DEFAULT TABLE TYPE CACHED; " +
            "SET DATABASE SQL SYNTAX MYS TRUE; " +
            "SET DATABASE TRANSACTION CONTROL MVCC; " +
            "SET DATABASE DEFAULT ISOLATION LEVEL READ COMMITTED;"
        );
        
        // Additional performance settings
        config.setAutoCommit(false);
        config.setConnectionTestQuery("SELECT 1 FROM INFORMATION_SCHEMA.SYSTEM_USERS");
        config.setValidationTimeout(5000);
        
        return config;
    }

    @Bean
    @Primary
    public DataSource dataSource() {
        return new HikariDataSource(hikariConfig());
    }
}