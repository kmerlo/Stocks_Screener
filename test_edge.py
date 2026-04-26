import time
import os
import logging
from selenium import webdriver
from selenium.webdriver.edge.options import Options

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test():
    logger.info("Chiusura forzata Edge...")
    os.system("taskkill /F /IM msedge.exe /T >nul 2>&1")
    time.sleep(2)
    
    user_data_dir = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data")
    
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    
    edge_exe = None
    for path in edge_paths:
        if os.path.exists(path):
            edge_exe = path
            break
            
    if not edge_exe:
        logger.error("No Edge found")
        return
        
    options = Options()
    options.binary_location = edge_exe
    options.add_argument(f"--user-data-dir={user_data_dir}")
    options.add_argument("--profile-directory=Default")
    options.add_argument("--remote-allow-origins=*")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    logger.info(f"Opening Edge...")
    try:
        driver = webdriver.Edge(options=options)
        driver.set_page_load_timeout(30)
        logger.info("Driver opened! Navigating to it.investing.com...")
        driver.get("https://it.investing.com")
        time.sleep(5)
        logger.info(f"Success! URL: {driver.current_url}")
        driver.quit()
    except Exception as e:
        logger.error(f"Failed: {e}")

if __name__ == '__main__':
    test()
