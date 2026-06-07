#!/usr/bin/env python3
"""
Migration script to split finance_app.db into config.db and market.db.
Run this ONCE to migrate existing data.
"""

import sqlite3
import os
import shutil
from pathlib import Path

def get_tables_in_db(db_path):
    """Get list of tables in a SQLite database."""
    if not os.path.exists(db_path):
        return []
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    tables = [row[0] for row in cursor.fetchall()]
    conn.close()
    return set(tables)

def copy_table_data(src_conn, dst_conn, table_name):
    """Copy all data from a table in src_conn to same table in dst_conn."""
    # Get table schema
    src_cursor = src_conn.cursor()
    src_cursor.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table_name}';")
    schema = src_cursor.fetchone()
    if not schema:
        print(f"  WARNING: Table {table_name} not found in source")
        return 0
    
    # Create table in destination if not exists
    dst_cursor = dst_conn.cursor()
    dst_cursor.execute(schema[0])
    
    # Copy data
    src_cursor.execute(f"SELECT * FROM '{table_name}';")
    rows = src_cursor.fetchall()
    
    if rows:
        placeholders = ','.join(['?' for _ in range(len(rows[0]))])
        dst_cursor.executemany(f"INSERT INTO '{table_name}' VALUES ({placeholders});", rows)
    
    src_conn.commit()
    dst_conn.commit()
    
    count = len(rows)
    print(f"  Copied {count} rows to {table_name}")
    return count

def main():
    # Paths
    original_db = "finance_app.db"
    config_db = "config.db"
    market_db = "market.db"
    
    # Safety checks
    if not os.path.exists(original_db):
        print(f"ERROR: {original_db} not found!")
        return 1
        
    if os.path.exists(config_db):
        print(f"ERROR: {config_db} already exists! Remove it or use --force.")
        return 1
        
    if os.path.exists(market_db):
        print(f"ERROR: {market_db} already exists! Remove it or use --force.")
        return 1
    
    print("=== Database Split Migration ===")
    print(f"Source: {original_db}")
    print(f"Config DB: {config_db}")
    print(f"Market DB: {market_db}")
    print()
    
    # Define which tables go where
    config_tables = {
        'ticker_lists',
        'tickers', 
        'chart_templates',
        'template_indicators',
        'screening_sheets',
        'screening_columns',
        'drawings',
        'alarms',
        'portfolio_urls',
        'portfolios',
        'transactions',
        'commission_plans',
        'tax_plans',
        'brokers',
        'fiscal_backpack_entries',
        'ticker_mappings'  # User chose this as config
    }
    
    market_tables = {
        'price_data',
        'fundamental_data',
        'historical_fundamental_data',
        'screening_values'
    }
    
    # Connect to source (read-only)
    print(f"Connecting to source database: {original_db}")
    src_conn = sqlite3.connect(f"file:{original_db}?mode=ro", uri=True)
    
    try:
        # Get all tables in source
        src_tables = set(get_tables_in_db(original_db))
        print(f"Source database contains {len(src_tables)} tables: {sorted(src_tables)}")
        print()
        
        # Verify we have all expected tables
        expected_tables = config_tables.union(market_tables)
        missing = expected_tables - src_tables
        extra = src_tables - expected_tables
        
        if missing:
            print(f"WARNING: Missing expected tables: {missing}")
        if extra:
            print(f"INFO: Extra tables found (will ignore): {extra}")
        
        # Create and populate config.db
        print(f"Creating {config_db}...")
        if os.path.exists(config_db):
            os.remove(config_db)
        config_conn = sqlite3.connect(config_db)
        
        config_count = 0
        for table in sorted(config_tables):
            if table in src_tables:
                count = copy_table_data(src_conn, config_conn, table)
                config_count += count
        
        config_conn.close()
        print(f"Total config rows: {config_count}")
        print()
        
        # Create and populate market.db
        print(f"Creating {market_db}...")
        if os.path.exists(market_db):
            os.remove(market_db)
        market_conn = sqlite3.connect(market_db)
        
        market_count = 0
        for table in sorted(market_tables):
            if table in src_tables:
                count = copy_table_data(src_conn, market_conn, table)
                market_count += count
        
        market_conn.close()
        print(f"Total market rows: {market_count}")
        print()
        
        # Verify row counts match source
        print("Verifying row counts...")
        src_conn.close()
        src_conn = sqlite3.connect(original_db)  # Re-open for verification
        
        total_src_rows = 0
        for table in sorted(expected_tables):
            if table in src_tables:
                cursor = src_conn.cursor()
                cursor.execute(f"SELECT COUNT(*) FROM '{table}';")
                count = cursor.fetchone()[0]
                total_src_rows += count
                # Verify against copy
                if table in config_tables:
                    # Check config.db
                    verify_conn = sqlite3.connect(config_db)
                    vcursor = verify_conn.cursor()
                    vcursor.execute(f"SELECT COUNT(*) FROM '{table}';")
                    vcount = vcursor.fetchone()[0]
                    verify_conn.close()
                    if vcount != count:
                        print(f"  ERROR: {table} count mismatch: source={count}, config={vcount}")
                elif table in market_tables:
                    # Check market.db
                    verify_conn = sqlite3.connect(market_db)
                    vcursor = verify_conn.cursor()
                    vcursor.execute(f"SELECT COUNT(*) FROM '{table}';")
                    vcount = vcursor.fetchone()[0]
                    verify_conn.close()
                    if vcount != count:
                        print(f"  ERROR: {table} count mismatch: source={count}, market={vcount}")
        
        src_conn.close()
        print(f"Total source rows: {total_src_rows}")
        print("Row count verification completed.")
        print()
        
        # Rename original database as backup (per AGENTS.md: we don't delete user data)
        backup_name = f"{original_db}.migrated.bak"
        print(f"Renaming original database to: {backup_name}")
        shutil.move(original_db, backup_name)
        
        print()
        print("=== Migration Complete ===")
        print(f"Original database backed up as: {backup_name}")
        print(f"Config database (to commit): {config_db}")
        print(f"Market database (gitignored): {market_db}")
        print()
        print("Next steps:")
        print("1. Verify the new databases work correctly")
        print("2. Update .gitignore to exclude market.db*")
        print("3. Commit config.db to your repository")
        print("4. Update application to use the two databases")
        
        return 0
        
    except Exception as e:
        print(f"ERROR during migration: {e}")
        # Clean up partial files
        if os.path.exists(config_db):
            os.remove(config_db)
        if os.path.exists(market_db):
            os.remove(market_db)
        return 1

if __name__ == "__main__":
    exit(main())