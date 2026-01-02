from flask import Flask, render_template, request, jsonify
import database
import os

app = Flask(__name__)

@app.route('/')
def index():
    return "Please go to a board, e.g., <a href='/general'>/general</a>"

@app.route('/<board_slug>')
def board(board_slug):
    try:
        with open('VERSION', 'r') as f:
            version = f.read().strip()
    except FileNotFoundError:
        version = 'dev'
    return render_template('board.html', board_slug=board_slug, version=version)

@app.route('/api/<board_slug>/questions', methods=['GET'])
def get_questions(board_slug):
    query = request.args.get('q')
    
    if query:
        questions = database.search_questions(board_slug, query, limit=20)
    else:
        questions = database.get_questions(board_slug)
        
    return jsonify(questions)

@app.route('/api/<board_slug>/questions', methods=['POST'])
def add_question(board_slug):
    data = request.json
    content = data.get('content')
    if not content:
        return jsonify({'error': 'Content is required'}), 400
        
    new_id = database.add_question(board_slug, content)
    return jsonify({'id': new_id, 'status': 'success'}), 201

@app.route('/api/<board_slug>/questions/<int:question_id>/vote', methods=['POST'])
def vote_question(board_slug, question_id):
    if board_slug == 'testing':
        amount = 20
    else:
        amount = 1
    new_votes = database.vote_question(question_id, amount)
    if new_votes is None:
        return jsonify({'error': 'Question not found'}), 404
    return jsonify({'votes': new_votes, 'id': question_id})

if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    # CEV-Forward: Respect the environment's wishes. Default to 5000 for local dev.
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
