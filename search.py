import difflib

def search_questions(query, questions):
    """
    Filters a list of questions based on fuzzy matching with the query.
    Returns a list of matching questions.
    """
    if not query:
        return questions

    query = query.lower()
    matches = []
    
    for q in questions:
        content = q['content'].lower()
        # Calculate similarity ratio
        ratio = difflib.SequenceMatcher(None, query, content).ratio()
        
        # Simple inclusion check is also good for partial matches
        if query in content:
            matches.append((1.0, q)) # High priority
        elif ratio > 0.4: # Threshold for fuzzy match
            matches.append((ratio, q))
            
    # Sort by score (descending)
    matches.sort(key=lambda x: x[0], reverse=True)
    
    return [m[1] for m in matches]
