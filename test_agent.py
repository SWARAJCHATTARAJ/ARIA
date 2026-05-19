from aria.agent import ResearchAgent
from aria.config import Settings
from aria.rag import VectorMemory

def main() -> None:
    settings = Settings.from_env()
    memory = VectorMemory(settings)
    agent = ResearchAgent(settings, memory)
    result = agent.run("What is quantum computing?", use_web=True, use_finance=False, max_iterations=1)
    print(result.answer)


if __name__ == "__main__":
    main()
