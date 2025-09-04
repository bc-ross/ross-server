import requests
from bs4 import BeautifulSoup

URL = "https://bc-coll-prodss.benedictine.edu/Student/Planning/DegreePlans"

# NOTE: This page may require authentication. If so, requests alone will not work for protected content.
def scrape_coursebubbles():
    resp = requests.get(URL)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')
    bubbles = soup.find_all(class_="dp-coursebubble")
    return [b.get_text(strip=True) for b in bubbles]

if __name__ == "__main__":
    for text in scrape_coursebubbles():
        print(text)
