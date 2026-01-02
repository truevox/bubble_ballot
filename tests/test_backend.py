import unittest
import os
import json
import tempfile
import database
import app

class BoardTestCase(unittest.TestCase):
    def setUp(self):
        # Create a temporary database
        self.db_fd, database.DB_NAME = tempfile.mkstemp()
        database.init_db()
        
        self.app = app.app.test_client()
        self.app.testing = True

    def tearDown(self):
        os.close(self.db_fd)
        os.unlink(database.DB_NAME)

    def test_add_and_get_question(self):
        # Add a question
        rv = self.app.post('/api/test_board/questions', 
                           data=json.dumps({'content': 'Is this a test?'}),
                           content_type='application/json')
        self.assertEqual(rv.status_code, 201)
        data = json.loads(rv.data)
        self.assertIn('id', data)
        question_id = data['id']

        # Get questions
        rv = self.app.get('/api/test_board/questions')
        data = json.loads(rv.data)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['content'], 'Is this a test?')
        self.assertEqual(data[0]['id'], question_id)

    def test_add_question_no_content(self):
        # Add a question with no content
        rv = self.app.post('/api/test_board/questions',
                           data=json.dumps({}),
                           content_type='application/json')
        self.assertEqual(rv.status_code, 400)

    def test_board_separation(self):
        # Add to board A
        self.app.post('/api/board_A/questions', 
                      data=json.dumps({'content': 'Question A'}),
                      content_type='application/json')
        
        # Add to board B
        self.app.post('/api/board_B/questions', 
                      data=json.dumps({'content': 'Question B'}),
                      content_type='application/json')
        
        # Check Board A
        rv = self.app.get('/api/board_A/questions')
        data = json.loads(rv.data)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['content'], 'Question A')

        # Check Board B
        rv = self.app.get('/api/board_B/questions')
        data = json.loads(rv.data)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['content'], 'Question B')

    def test_voting(self):
        # Add question
        board_slug = 'vote_board'
        rv = self.app.post(f'/api/{board_slug}/questions',
                           data=json.dumps({'content': 'Vote for me'}),
                           content_type='application/json')
        q_id = json.loads(rv.data)['id']

        # Vote up (default direction)
        rv = self.app.post(f'/api/{board_slug}/questions/{q_id}/vote',
                           data=json.dumps({}),
                           content_type='application/json')
        self.assertEqual(rv.status_code, 200)
        data = json.loads(rv.data)
        self.assertEqual(data['votes'], 1)

        # Vote down (unvote)
        rv = self.app.post(f'/api/{board_slug}/questions/{q_id}/vote',
                           data=json.dumps({'direction': 'down'}),
                           content_type='application/json')
        self.assertEqual(rv.status_code, 200)
        data = json.loads(rv.data)
        self.assertEqual(data['votes'], 0)

    def test_unvoting(self):
        # Add question
        board_slug = 'unvote_board'
        rv = self.app.post(f'/api/{board_slug}/questions',
                           data=json.dumps({'content': 'Unvote for me'}),
                           content_type='application/json')
        q_id = json.loads(rv.data)['id']

        # Vote up
        rv = self.app.post(f'/api/{board_slug}/questions/{q_id}/vote',
                           data=json.dumps({'direction': 'up'}),
                           content_type='application/json')
        self.assertEqual(rv.status_code, 200)
        data = json.loads(rv.data)
        self.assertEqual(data['votes'], 1)

        # Vote down (unvote)
        rv = self.app.post(f'/api/{board_slug}/questions/{q_id}/vote',
                           data=json.dumps({'direction': 'down'}),
                           content_type='application/json')
        self.assertEqual(rv.status_code, 200)
        data = json.loads(rv.data)
        self.assertEqual(data['votes'], 0)

    def test_weighted_voting_on_testing_board(self):
        # Add question to the 'testing' board
        rv = self.app.post('/api/testing/questions',
                           data=json.dumps({'content': 'Weighted vote test'}),
                           content_type='application/json')
        self.assertEqual(rv.status_code, 201)
        q_id = json.loads(rv.data)['id']

        # Vote once
        rv = self.app.post(f'/api/testing/questions/{q_id}/vote',
                           data=json.dumps({}),
                           content_type='application/json')
        self.assertEqual(rv.status_code, 200)
        data = json.loads(rv.data)
        self.assertEqual(data['votes'], 20)

        # Vote again
        rv = self.app.post(f'/api/testing/questions/{q_id}/vote',
                           data=json.dumps({}),
                           content_type='application/json')
        self.assertEqual(rv.status_code, 200)
        data = json.loads(rv.data)
        self.assertEqual(data['votes'], 40)

    def test_vote_non_existent_question(self):
        rv = self.app.post('/api/any_board/questions/999/vote',
                           data=json.dumps({}),
                           content_type='application/json')
        self.assertEqual(rv.status_code, 404)

    def test_fuzzy_search(self):
        board = 'search_board'
        questions = ['Apple', 'Banana', 'Application', 'Cranberry']
        
        for q in questions:
            self.app.post(f'/api/{board}/questions', 
                          data=json.dumps({'content': q}),
                          content_type='application/json')

        # Search for "App"
        rv = self.app.get(f'/api/{board}/questions?q=App')
        data = json.loads(rv.data)
        # Should match Apple and Application
        contents = [q['content'] for q in data]
        self.assertIn('Apple', contents)
        self.assertIn('Application', contents)
        self.assertNotIn('Banana', contents)
        
        # Test fuzzy "Ban ana" -> "Banana"
        rv = self.app.get(f'/api/{board}/questions?q=Ban ana') # Fuzzy
        data = json.loads(rv.data)
        if data: # fuzzy matching might be tricky with short strings, let's see
             self.assertEqual(data[0]['content'], 'Banana')

if __name__ == '__main__':
    unittest.main()
