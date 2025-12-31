# Underwater Questions

A simple, modern, underwater-themed Q&A board webapp.

## Features

*   **No Login Required:** Jump straight in.
*   **Dynamic Boards:** Create a new board simply by visiting a new URL (e.g., `/marketing`, `/random`).
*   **Real-time-ish:** Polls for updates every few seconds.
*   **Fuzzy Search:** Filter questions as you type to prevent duplicates.
*   **Visuals:** Bubbles! Votes add smaller bubbles inside the main question bubble.

## How to Run

### Using Docker (Recommended)

1.  Ensure you have Docker and Docker Compose installed.
2.  Run the following command in the project root:

    ```bash
    docker-compose up
    ```

3.  Open your browser and navigate to `http://localhost:5000/general` (or any other topic you like).

### Manual Run

1.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
2.  Run the app:
    ```bash
    python app.py
    ```
3.  Open `http://localhost:5000/general`.
