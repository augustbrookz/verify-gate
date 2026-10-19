# Gate a RAG answer before sending it (Python, 20 lines, no SDK needed).
import os, uuid, requests

def answer_with_gate(question, retrieve, generate):
    docs = retrieve(question)                       # [{"id": ..., "text": ...}]
    draft = generate(question, docs)
    r = requests.post(
        "https://xyntherium.com/v1/verify",
        headers={"Authorization": f"Bearer {os.environ['XYN_API_KEY']}",
                 "Idempotency-Key": str(uuid.uuid4())},
        json={"question": question, "answer": draft, "sources": docs},
        timeout=120,
    )
    r.raise_for_status()
    result = r.json()
    if result["release_recommendation"] == "allow":
        return {"answer": draft, "ledger": result["evidence_ledger_id"]}
    problems = [f'{c["verdict"]}: {c["text"]}' for c in result["claims"] if c["verdict"] != "supported"]
    # Regenerate, ask for citations, or hand off: never send unsupported claims.
    return {"answer": None, "needs": result["release_recommendation"], "problems": problems}
