import asyncio
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from pipeline.nodes import run_claim_audit

async def test_year_rule():
    print("=" * 80)
    print("TEST D.2: YEAR RULE VERIFICATION")
    print("Rule: A year from citation metadata proves only the publication year.")
    print("If a claim says something happened 'in YYYY', YYYY must appear in the cited text.")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # Case 1: Violation of Year Rule
    # The citation has metadata year: 2024 and published: "2024",
    # but the actual snippet text says nothing about 2024.
    # Claim asserts: "In 2024, researchers observed exoplanet atmospheres [[c:0]]."
    # -------------------------------------------------------------------------
    chunks_case_1 = [
        {
            "title": "Exoplanet Atmosphere Observations",
            "venue": "Astrophysical Journal",
            "snippet": "Researchers observed exoplanet atmospheres using transmission spectroscopy with high precision.",
            "year": 2024,
            "published": "2024"
        }
    ]
    answer_case_1 = "In 2024, researchers observed exoplanet atmospheres [[c:0]]."

    claims_1 = await run_claim_audit(answer_case_1, chunks_case_1)
    c1 = claims_1[0]
    print("\n[Case 1: Claim asserts 'in 2024', but '2024' only in citation metadata, NOT in snippet text]")
    print(f"Claim Text: '{c1['text']}'")
    print(f"Citation Snippet: '{chunks_case_1[0]['snippet']}'")
    print(f"Citation Metadata: year={chunks_case_1[0]['year']}, published='{chunks_case_1[0]['published']}'")
    print(f"Supported: {c1['supported']}")
    print(f"Status: {c1['status']}")
    print(f"Audit Note: {c1['note']}")

    assert not c1["supported"], "Case 1 should fail verification because 2024 is missing from cited text!"
    assert "Year rule" in c1["note"], "Audit note should cite the Year rule violation!"
    print("-> PASS: Case 1 correctly flagged under Year rule.")

    # -------------------------------------------------------------------------
    # Case 2: Conforming to Year Rule
    # The snippet text explicitly mentions 2024.
    # -------------------------------------------------------------------------
    chunks_case_2 = [
        {
            "title": "Exoplanet Atmosphere Observations in 2024",
            "venue": "Astrophysical Journal",
            "snippet": "In 2024, researchers observed exoplanet atmospheres using transmission spectroscopy with high precision.",
            "year": 2024,
            "published": "2024"
        }
    ]
    answer_case_2 = "In 2024, researchers observed exoplanet atmospheres [[c:0]]."

    claims_2 = await run_claim_audit(answer_case_2, chunks_case_2)
    c2 = claims_2[0]
    print("\n[Case 2: Claim asserts 'in 2024', and '2024' IS explicitly present in snippet text]")
    print(f"Claim Text: '{c2['text']}'")
    print(f"Citation Snippet: '{chunks_case_2[0]['snippet']}'")
    print(f"Supported: {c2['supported']}")
    print(f"Status: {c2['status']}")
    print(f"Audit Note: {c2['note']}")

    assert "Year rule" not in c2.get("note", ""), "Case 2 should NOT be flagged under Year rule!"
    print("-> PASS: Case 2 satisfied the Year rule.")

    print("\n" + "=" * 80)
    print("ALL YEAR RULE AUDIT TESTS PASSED")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_year_rule())
