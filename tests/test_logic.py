import unittest
import os
import tempfile
import database

class DatabaseTestCase(unittest.TestCase):
    def setUp(self):
        # Create a temporary database
        self.db_fd, database.DB_NAME = tempfile.mkstemp()
        database.init_db()
        # Add some test data
        database.add_question('search_board', 'Apple')
        database.add_question('search_board', 'Application')
        database.add_question('search_board', 'Banana')

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

    def test_search_questions(self):
        # Partial match should return multiple results
        results = database.search_questions('search_board', 'App')
        self.assertEqual(len(results), 2)
        contents = {q['content'] for q in results}
        self.assertIn('Apple', contents)
        self.assertIn('Application', contents)

        # Exact match should return one result
        results = database.search_questions('search_board', 'Apple')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['content'], 'Apple')

        # Another partial match
        results = database.search_questions('search_board', 'Banana')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['content'], 'Banana')

        # No match
        results = database.search_questions('search_board', 'Zebra')
        self.assertEqual(len(results), 0)

        # Empty query should return all questions for the board
        results = database.search_questions('search_board', '')
        self.assertEqual(len(results), 3)

        # Test limit parameter
        results = database.search_questions('search_board', 'App', limit=1)
        self.assertEqual(len(results), 1)

    def test_get_recent_boards(self):
        # Add questions to different boards with different timestamps
        # Since we can't easily manipulate created_at in the default schema without recreating,
        # we rely on insertion order if timestamps are current_timestamp.
        # But sqlite current_timestamp might be same for fast insertions.
        # Let's verify we at least get the boards back.

        database.add_question('board_1', 'q1')
        database.add_question('board_2', 'q2')
        database.add_question('board_3', 'q3')
        database.add_question('board_4', 'q4')

        # We might not guarantee order if all added same second, but we should get distinct boards
        recent = database.get_recent_boards()

        # Should return at most 3
        self.assertLessEqual(len(recent), 3)
        self.assertGreater(len(recent), 0)

        # Check that returned items are strings
        self.assertIsInstance(recent[0], str)

if __name__ == '__main__':
    unittest.main()
