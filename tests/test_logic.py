import unittest
import os
import tempfile
import database
import search

class DatabaseTestCase(unittest.TestCase):
    def setUp(self):
        # Create a temporary database
        self.db_fd, database.DB_NAME = tempfile.mkstemp()
        database.init_db()

    def tearDown(self):
        os.close(self.db_fd)
        os.unlink(database.DB_NAME)

    def test_add_and_get_question(self):
        # Add a question
        question_id = database.add_question('test_board', 'Is this a test?')
        self.assertIsNotNone(question_id)

        # Get questions
        questions = database.get_questions('test_board')
        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]['content'], 'Is this a test?')
        self.assertEqual(questions[0]['id'], question_id)

    def test_board_separation(self):
        # Add to board A
        database.add_question('board_A', 'Question A')

        # Add to board B
        database.add_question('board_B', 'Question B')

        # Check Board A
        questions_A = database.get_questions('board_A')
        self.assertEqual(len(questions_A), 1)
        self.assertEqual(questions_A[0]['content'], 'Question A')

        # Check Board B
        questions_B = database.get_questions('board_B')
        self.assertEqual(len(questions_B), 1)
        self.assertEqual(questions_B[0]['content'], 'Question B')

    def test_voting(self):
        # Add question
        q_id = database.add_question('vote_board', 'Vote for me')

        # Vote
        new_votes = database.vote_question(q_id)
        self.assertEqual(new_votes, 1)

        # Vote again
        new_votes = database.vote_question(q_id)
        self.assertEqual(new_votes, 2)

    def test_vote_non_existent_question(self):
        new_votes = database.vote_question(999)
        self.assertIsNone(new_votes)

class SearchTestCase(unittest.TestCase):
    def test_search_questions(self):
        questions = [
            {'content': 'Apple', 'id': 1},
            {'content': 'Banana', 'id': 2},
            {'content': 'Application', 'id': 3},
            {'content': 'Cranberry', 'id': 4}
        ]

        # "Exact" match (substring and fuzzy)
        results = search.search_questions('Apple', questions)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]['content'], 'Apple')
        self.assertEqual(results[1]['content'], 'Application')

        # Partial match
        results = search.search_questions('App', questions)
        self.assertEqual(len(results), 2)
        contents = {q['content'] for q in results}
        self.assertEqual(contents, {'Apple', 'Application'})

        # Fuzzy match
        results = search.search_questions('Bana', questions)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['content'], 'Banana')

        # No match
        results = search.search_questions('Zebra', questions)
        self.assertEqual(len(results), 0)

        # Empty query
        results = search.search_questions('', questions)
        self.assertEqual(len(results), 4)

if __name__ == '__main__':
    unittest.main()
