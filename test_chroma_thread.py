from concurrent.futures import ThreadPoolExecutor
from aria.config import Settings
from aria.rag import VectorMemory

def main() -> None:
    settings = Settings.from_env()
    memory = VectorMemory(settings)

    def query_mem(query: str):
        return memory.retrieve(query)

    with ThreadPoolExecutor(max_workers=3) as executor:
        list(executor.map(query_mem, ["solar", "wind", "coal"]))

    print("SUCCESS")


if __name__ == "__main__":
    main()
