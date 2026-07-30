from aria.agent import classify_question, handle_casual_query, QueryType, ResearchSubtype

test_cases = {
    "1. Greetings": "hi",
    "2. Wellbeing check-ins": "how are you",
    "3. Gratitude/closing": "thanks",
    "4. Acknowledgment/reactions": "makes sense",
    "5. Small talk": "busy day?",
    "6. Compliments/feedback about ARIA": "you're helpful",
    "7. Mild frustration/casual complaints": "this is confusing",
    "8. Testing/probing messages": "123",
    "9. Casual follow-up to a previous research answer": "cool thanks for that",
    "10. Off-topic musing/jokes": "tell me a joke"
}

for category, query in test_cases.items():
    q_type, subtype = classify_question(query)
    print(f"--- {category} ---")
    print(f"Query: '{query}'")
    print(f"Classification: {q_type.name if hasattr(q_type, 'name') else q_type} -> {subtype.name if hasattr(subtype, 'name') else subtype}")
    if q_type == QueryType.CASUAL:
        reply = handle_casual_query(query, None)
        print(f"Response: {reply}\n")
    else:
        print("Response: (Routed to non-casual pipeline)\n")
