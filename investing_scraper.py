"""
Investing.com Portfolio Scraper
Uses Selenium with the user's existing Chrome profile to scrape portfolio data.
"""
import os
import logging
import time
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

def get_chrome_user_data_dir() -> str:
    """Returns the path to Chrome's user data directory."""
    return os.path.expanduser("~/.config/google-chrome")

def scrape_investing_portfolio(url: str) -> List[Dict]:
    """
    Scrape portfolio data from Investing.com using the user's Chrome profile.
    
    IMPORTANT: Chrome must be fully closed before calling this function.
    
    Args:
        url: The Investing.com portfolio URL
        
    Returns:
        List of dicts with portfolio data
    """
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    
    import subprocess
    
    chrome_options = Options()
    user_data_dir = get_chrome_user_data_dir()
    
    if not os.path.exists(user_data_dir):
        logger.warning(f"Chrome user data directory not found: {user_data_dir}. Procedo senza profilo utente.")
    
    # Find actual Chrome binary
    chrome_paths = [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium"
    ]
    
    for path in chrome_paths:
        if os.path.exists(path):
            chrome_options.binary_location = path
            logger.info(f"Strumento Chrome trovato in: {path}")
            break
            
    import tempfile
    
    # Crea una cartella sicura e temporanea per bypassare il blocco Snap su Chrome Linux
    tmp_user_data = tempfile.mkdtemp(prefix="chrome_debug_")
    chrome_options.add_argument(f"--user-data-dir={tmp_user_data}")
    chrome_options.add_argument("--remote-allow-origins=*")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--remote-debugging-port=9222")
    chrome_options.add_argument("--restore-last-session=false")
    chrome_options.add_argument("--hide-crash-restore-bubble")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    # Evasion: Disable navigator.webdriver
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.page_load_strategy = 'eager'
    
    # Suppress verbose Chromium/Edge logging in the terminal
    chrome_options.add_argument("--log-level=3")
    chrome_options.add_argument("--disable-logging")
    chrome_options.add_argument("--silent")
    
    logger.info("Chiusura forzata di eventuali task Chrome in background per liberare il profilo utente...")
    os.system("pkill -f chrome")
    time.sleep(2.0)
    
    driver = None
    try:
        logger.info(f"Opening Chrome from {user_data_dir}")
        driver = webdriver.Chrome(options=chrome_options)
        
        driver.set_page_load_timeout(45)
        
        logger.info(f"Navigazione verso il portfolio: {url}")
        
        try:
            driver.get(url)
        except Exception as e:
            logger.warning(f"Navigazione standard fallita o andata in timeout: {e}")
            logger.info("Forzo la navigazione tramite javascript...")
            driver.execute_script(f"window.location.href = '{url}';")
            
        time.sleep(1)
        current = driver.current_url
        logger.info(f"Pagina attuale dopo la navigazione: {current}")
        
        if "about:blank" in current or "chrome://" in current or "extension://" in current:
             logger.warning("Ancora bloccati in una pagina vuota o estensione. Riprovo la forzatura...")
             driver.execute_script(f"window.location.href = '{url}';")
             time.sleep(2)
        
        # Check for Cloudflare/Just a moment
        logger.info("Controllo presenza Cloudflare verification...")
        for _ in range(15):
            # Check for Cloudflare specific elements or title
            is_cf = "Just a moment" in driver.title or "Verifica in corso" in driver.page_source[:5000]
            
            # Check if actual content already exists to avoid false positives and speed up
            has_content = False
            try:
                if driver.find_elements(By.CSS_SELECTOR, "table, .portfolio-header"):
                    has_content = True
            except:
                pass

            if is_cf and not has_content:
                logger.info("Cloudflare rilevato, attendo...")
                time.sleep(2)
            else:
                break

        # Handle cookie consent if present
        try:
            cookie_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "button#onetrust-accept-btn-handler, button.accept-all, [data-test='accept-all']"))
            )
            cookie_btn.click()
            logger.info("Accepted cookie consent")
        except Exception:
            logger.info("No cookie consent dialog found or already accepted")
        
        # Also try the Italian cookie button
        try:
            btns = driver.find_elements(By.XPATH, "//button[contains(text(), 'Accetto')]")
            if btns:
                btns[0].click()
                logger.info("Accepted Italian cookie consent")
        except Exception:
            pass
        
        # Wait for the portfolio table to load
        logger.info("Waiting for portfolio table...")
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "table"))
        )
        time.sleep(0.5)  # Extra wait for dynamic content
        
        def extract_current_table():
            data = []
            tables = driver.find_elements(By.CSS_SELECTOR, "table")
            if not tables:
                return data
            
            target_table = None
            for table in tables:
                headers = table.find_elements(By.CSS_SELECTOR, "th")
                header_texts = [h.text.strip().lower() for h in headers]
                if any(kw in ' '.join(header_texts) for kw in ['nome', 'simbolo', 'ultimo', '5 minuti', 'giornaliero']):
                    target_table = table
                    break
            
            if not target_table:
                target_table = max(tables, key=lambda t: len(t.find_elements(By.CSS_SELECTOR, "tr")))
            
            headers = target_table.find_elements(By.CSS_SELECTOR, "thead th")
            header_names = [h.text.strip() for h in headers]
            
            rows = target_table.find_elements(By.CSS_SELECTOR, "tbody tr")
            for row in rows:
                cells = row.find_elements(By.CSS_SELECTOR, "td")
                if len(cells) < 2:
                    continue
                
                cell_texts = [c.text.strip() for c in cells]
                row_data = {}
                for i, header in enumerate(header_names):
                    if header and i < len(cell_texts):
                        row_data[header] = cell_texts[i]
                
                if row_data:
                    data.append(row_data)
            return data

        # Extract "Prezzo" (default tab)
        logger.info("Extracting 'Prezzo' table...")
        prezzo_data = extract_current_table()
        logger.info(f"Scraped {len(prezzo_data)} 'Prezzo' entries")
        
        # Switch to "Sezione tecnica"
        tecnica_data = []
        try:
            logger.info("Switching to 'Sezione tecnica' tab...")
            tab_btn = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//*[contains(text(), 'Sezione tecnica')]"))
            )
            driver.execute_script("arguments[0].click();", tab_btn)
            time.sleep(1) # Wait for table mapping to change
            
            logger.info("Extracting 'Sezione tecnica' table...")
            tecnica_data = extract_current_table()
            logger.info(f"Scraped {len(tecnica_data)} 'Sezione tecnica' entries")
        except Exception as e:
            logger.error(f"Failed to extract 'Sezione tecnica': {e}")
            
        return {
            "prezzo": prezzo_data,
            "tecnica": tecnica_data
        }
        
    except Exception as e:
        logger.error(f"Scraping error: {e}")
        raise RuntimeError(f"Errore durante lo scraping: {str(e)}")
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


def download_investing_csv(url: str) -> Dict:
    """
    Automates the download of the Investing.com portfolio CSV using Edge.
    """
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    
    import subprocess
    import tempfile
    import shutil
    import glob
    import csv
    
    csv_dir = os.path.join(os.path.dirname(__file__), "CSV")
    os.makedirs(csv_dir, exist_ok=True)
    logger.info(f"Using CSV download directory: {csv_dir}")
    
    chrome_options = Options()
    user_data_dir = get_chrome_user_data_dir()
    
    chrome_paths = [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium"
    ]
    
    for path in chrome_paths:
        if os.path.exists(path):
            chrome_options.binary_location = path
            break
            
    if os.path.exists(user_data_dir):
        chrome_options.add_argument(f"--user-data-dir={user_data_dir}")
        chrome_options.add_argument("--profile-directory=Default")
        
    chrome_options.add_argument("--remote-allow-origins=*")
    chrome_options.add_argument("--restore-last-session=false")
    chrome_options.add_argument("--hide-crash-restore-bubble")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    # Evasion: Disable navigator.webdriver
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.page_load_strategy = 'eager'
    
    # Configure auto-download to specific folder
    chrome_options.add_experimental_option("prefs", {
        "download.default_directory": csv_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True
    })
    
    chrome_options.add_argument("--log-level=3")
    chrome_options.add_argument("--disable-logging")
    chrome_options.add_argument("--silent")
    
    os.system("pkill -f chrome")
    time.sleep(2.0)
    
    driver = None
    try:
        driver = webdriver.Chrome(options=chrome_options)
        driver.set_page_load_timeout(45)
        
        logger.info(f"Navigazione verso il portfolio: {url}")
        try:
            driver.get(url)
        except Exception as e:
            logger.warning(f"Navigazione standard fallita o andata in timeout: {e}")
            logger.info("Forzo la navigazione tramite javascript...")
            driver.execute_script(f"window.location.href = '{url}';")
            
        time.sleep(2)
        current = driver.current_url
        logger.info(f"Pagina attuale dopo la navigazione: {current}")
        
        if "about:blank" in current or "chrome://" in current or "extension://" in current:
             logger.warning("Ancora bloccati in una pagina vuota o estensione. Riprovo la forzatura...")
             driver.execute_script(f"window.location.href = '{url}';")
             time.sleep(2)
             
        # Check for Cloudflare/Just a moment
        logger.info("Controllo presenza Cloudflare verification...")
        for _ in range(15):
             # Check for Cloudflare title or specific text in early page source
            is_cf = "Just a moment" in driver.title or "Verifica in corso" in driver.page_source[:5000]
            
            # Check if actual content already exists
            has_content = False
            try:
                if driver.find_elements(By.CSS_SELECTOR, "table, .portfolio-header"):
                    has_content = True
            except:
                pass

            if is_cf and not has_content:
                logger.info("Cloudflare rilevato, attendo...")
                time.sleep(2)
            else:
                break
        
        # Cookies
        try:
            cookie_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "button#onetrust-accept-btn-handler, button.accept-all, [data-test='accept-all']"))
            )
            cookie_btn.click()
            logger.info("Accepted cookies")
        except Exception:
            pass
            
        try:
            btns = driver.find_elements(By.XPATH, "//button[contains(text(), 'Accetto')]")
            if btns:
                btns[0].click()
        except Exception:
            pass
            
        logger.info("Locating 'Scarica Portafoglio' header/button...")
        
        # First try to see if we need to click a dropdown menu (three dots)
        try:
            # Look for elements that might be the 3-dots menu near the watchlist
            menus = driver.find_elements(By.CSS_SELECTOR, "[data-test='portfolio-header-menu'], .portfolio-header-menu, button[aria-label='Menu'], button[aria-haspopup='menu']")
            if menus:
                driver.execute_script("arguments[0].click();", menus[0])
                time.sleep(1)
        except Exception:
            pass

        try:
            # Wait for either the direct link or the text inside a dropdown
            download_link = WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "a[name='download'], a.js-download-portfolio, a[title*='Scarica']"))
            )
            driver.execute_script("arguments[0].click();", download_link)
            logger.info("Clicked 'Scarica Portafoglio'")
        except Exception as e:
            with open("error_page.html", "w", encoding="utf-8") as f:
                f.write(driver.page_source)
            logger.error(f"Failed to find Scarica Portafoglio. Saved error_page.html")
            raise RuntimeError("Non riesco a trovare il pulsante 'Scarica Portafoglio'. Html salvato.")

        # Get list of existing CSV files to ignore them BEFORE clicking download
        existing_csvs = set(glob.glob(os.path.join(csv_dir, "*.csv")))

        # Wait for modal and click the actual download button (orange 'Scarica')
        logger.info("Waiting for download modal...")
        try:
            confirm_btn = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "a.js-save, a.Orange.js-save"))
            )
            confirm_btn.click() # Click normally first, fallback to JS
            logger.info("Clicked confirm button.")
        except Exception:
            try:
                confirm_btn = driver.find_element(By.CSS_SELECTOR, "a.js-save, a.Orange.js-save")
                driver.execute_script("arguments[0].click();", confirm_btn)
                logger.info("Confirmed download via JS.")
            except Exception as e:
                with open("error_page.html", "w", encoding="utf-8") as f:
                    f.write(driver.page_source)
                logger.error(f"Failed to find 'Scarica' confirmation button. Saved error_page.html")
                raise RuntimeError("Non riesco a confermare lo scaricamento nel popup. Html salvato.")
            
        # Wait for CSV file to appear in csv_dir (find the newest one after we click)
        logger.info("Waiting for CSV file in folder...")
        timeout = 20
        elapsed = 0
        csv_file = None
        
        while elapsed < timeout:
            # Check if there are any active downloads
            crdownloads = glob.glob(os.path.join(csv_dir, "*.crdownload"))
            if not crdownloads:
                current_csvs = set(glob.glob(os.path.join(csv_dir, "*.csv")))
                new_csvs = current_csvs - existing_csvs
                if new_csvs:
                    # Get the most recently modified new CSV
                    csv_file = max(new_csvs, key=os.path.getmtime)
                    break
            time.sleep(1)
            elapsed += 1
            
        if not csv_file:
            raise RuntimeError("CSV file download timed out.")
            
        # Give it a tiny bit of time to finish writing
        time.sleep(1)
        
        # Parse CSV
        logger.info(f"Parsing downloaded CSV: {csv_file}")
        data = parse_investing_csv_file(csv_file)
        
        # Extract name from filename (e.g., test_Watchlist_08032026.csv -> test)
        basename = os.path.basename(csv_file)
        name = basename.split('_')[0] if '_' in basename else basename.replace('.csv', '')
        
        return {
            "data": data,
            "name": name
        }
        
    except Exception as e:
        logger.error(f"CSV Download error: {e}")
        raise RuntimeError(f"Errore durante lo scaricamento CSV: {str(e)}")
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
        # We no longer delete the directory because the user wants to keep the CSV files

def parse_investing_csv_file(csv_file: str) -> List[Dict]:
    """Parses an Investing.com portfolio CSV file, skipping the category header row."""
    import csv
    data = []
    with open(csv_file, mode='r', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.reader(f)
        rows = list(reader)
        
        # Find the actual header row. Investing puts categories on row 0, and column names on row 1
        header_idx = 0
        for i, r in enumerate(rows):
            row_text = ''.join(r).lower()
            if 'simbolo' in row_text or 'nome' in row_text or 'ultimo' in row_text:
                header_idx = i
                break
                
        if len(rows) > header_idx + 1:
            headers = rows[header_idx]
            clean_headers = []
            header_counts = {}
            
            for idx, h in enumerate(headers):
                h_clean = h.strip()
                if not h_clean:
                    h_clean = f"Colonna_{idx}"
                
                # Handle duplicate headers
                if h_clean in header_counts:
                    header_counts[h_clean] += 1
                    h_clean = f"{h_clean} ({header_counts[h_clean]})"
                else:
                    header_counts[h_clean] = 1
                    
                clean_headers.append(h_clean)
                
            for row in rows[header_idx+1:]:
                if any(row):
                    row_dict = {}
                    for i, val in enumerate(row):
                        if i < len(clean_headers):
                            col_name = clean_headers[i]
                            cell_val = val.strip()
                            if col_name == "Prossima Data Utili":
                                cell_val = cell_val.replace(".", "/")
                            row_dict[col_name] = cell_val
                    data.append(row_dict)
                    
    logger.info(f"Successfully extracted {len(data)} rows from CSV '{csv_file}' using row {header_idx} as header.")
    return data

def read_local_investing_csv() -> Dict:
    """Reads the most recent CSV file from the local CSV folder without using Selenium."""
    import glob
    csv_dir = os.path.join(os.path.dirname(__file__), "CSV")
    logger.info(f"Looking for local CSVs in: {csv_dir}")
    
    if not os.path.exists(csv_dir):
        raise RuntimeError("La cartella CSV non esiste o è vuota.")
        
    csvs = glob.glob(os.path.join(csv_dir, "*.csv"))
    if not csvs:
        raise RuntimeError("Nessun file CSV trovato nella cartella locale.")
        
    latest_csv = max(csvs, key=os.path.getmtime)
    logger.info(f"Found latest CSV file: {latest_csv}")
    
    data = parse_investing_csv_file(latest_csv)
    basename = os.path.basename(latest_csv)
    name = basename.split('_')[0] if '_' in basename else basename.replace('.csv', '')
    
    return {
        "data": data,
        "name": name
    }
