const BINARY_OPERATIONS = {
  '+': {
    evaluate: (lhs, rhs) => lhs + rhs,
    precedance: 1
  },
  '-': {
    evaluate: (lhs, rhs) => lhs - rhs,
    precedance: 1
  },
  '>': {
    evaluate: (lhs, rhs) => lhs > rhs,
    precedance: 0
  },
  '*': {
    evaluate: (lhs, rhs) => lhs * rhs,
    precedance: 2
  },
  '/': {
    evaluate: (lhs, rhs) => lhs / rhs,
    precedance: 2
  }
};

const blocks = ['{{', '}}', '{%', '%}'];

class Tokens {
  constructor(tokens) {
    if (!tokens || tokens.length === 0) {
      throw new Error('No tokens');
    }

    this.tokens = tokens;
  }

  advance() {
    // todo: out of bounds checking
    return ++this.current_token;
  }

  peek() {
    return this.tokens[this.current_token + 1];
  }

  current_token = 0;
  tokens = [];
}

function tokenize(string) {
  const special = ['+', '-', '*', '/', '(', ')', '[', ']', '|', '=', ',', '<', '>', '%', '?', ':', '~'];
  const htmlSpecial = ['<', '>', '/'];
  const whitespace = ['\n', '\t', ' '];
  const stringChars = ['\'', '"'];

  let tokens = [];
  let token = '';
  let in_twig_expression = false;

  for (let i = 0; i < string.length; ++i) {
    const blockCharPosition = blocks.indexOf(string.slice(i, i + 2));
    if (blockCharPosition !== -1) {
      if (token.length > 0) {
        tokens.push(token);
        token = '';
      }

      in_twig_expression = blockCharPosition % 2 === 0;
      tokens.push(string.slice(i, i + 2));

      ++i;
    } else if (in_twig_expression && special.includes(string[i])) {
      if (token.length > 0) {
        tokens.push(token);
        token = '';
      }

      token = string[i];

      while (special.includes(string[i + 1])) {
        ++i;
        token += string[i];
      }

      tokens.push(token);
      token = '';

    } else if (in_twig_expression && whitespace.includes(string[i])) {
      if (token.length > 0) {
        tokens.push(token);
        token = '';
      }
    } else if (stringChars.includes(string[i])) {
      if (token.length > 0) {
        tokens.push(token);
        token = '';
      }

      while (!stringChars.includes(string[++i])) {
        token += string[i];
      }

      tokens.push(token);
      token = '';
    } else {
      token += string[i];
    }
  }

  if (token.length > 0) {
    tokens.push(token);
  }

  if (in_twig_expression) {
    throw new Error('Unterminated twig expression: ' + string);
  }

  return new Tokens(tokens);
}

/**
 * @param {Tokens} tokens 
 */
function parse_primary(tokens) {
  do {
    let token = tokens.peek();
    if (token && !blocks.includes(token)) {
      return token;
    } else if (!token) {
      throw new Error('Expected a primary expression');
    }
  } while (tokens.advance())
}

/**
 * Source: https://en.wikipedia.org/wiki/Operator-precedence_parser#Precedence_climbing_method
 * @param {Tokens} tokens 
 */
function parse(tokens, min_precedance = 0) {
  let lhs = parse_primary(tokens);
  let lookahead = tokens.peek();
  while (BINARY_OPERATIONS[lookahead] && BINARY_OPERATIONS[lookahead].precedance >= min_precedance) {
    const operation = lookahead;
    const first_op_precedance = BINARY_OPERATIONS[lookahead].precedance;
    tokens.advance();

    let rhs = parse_primary(tokens);

    lookahead = tokens.peek();

    while (BINARY_OPERATIONS[lookahead] && BINARY_OPERATIONS[lookahead].precedance > first_op_precedance) {
      const second_op_precedance = BINARY_OPERATIONS[lookahead].precedance;
      rhs = parse(tokens, second_op_precedance + 1);
      lookahead = tokens.peek();
    }

    if (operation in BINARY_OPERATIONS) {
      lhs = {
        operation: BINARY_OPERATIONS[operation],
        lhs,
        rhs: parse(tokens)
      }
    }

    throw new Error(`Unhandled binary operator '${operation}'`);
  }

  return lhs;
}

/**
 * 
 * @param {string} token 
 * @returns {Number|string}
 */
function to_value(token) {
  if (!token) {
    return null;
  }

  const number = Number(token);

  if (!isNaN(number)) {
    return number;
  }

  // todo: when twig encounters a string like "2a3b" in a binary operation and the first operand is a number, it will convert
  //       however many numbers are at the start of the string and ignore the rest and use that in the equation.
  //       E.g. 15 + "2a3b" === 17

  return token;
}

function evaluate(ast_node) {
  if (typeof (ast_node) === 'object') {
    return ast_node.operation.evaluate(to_value(ast_node.lhs), evaluate(ast_node.rhs));
  }

  return to_value(ast_node);
}

function compile(string) {
  return parse(tokenize(string));
}

console.log(evaluate(compile('{{ 2 + 5 * 3 + 1 }}<br/>')));
console.log(compile('{{ 2>1 }}<br/>'));
console.log(compile('{{ data.field1_1 }} EUR'));
console.log(compile(`{{ data.field1_1 ?? 0 | number_format(2,',',' ') }}`));
// console.log(compile(`{{ data.field1_1 ?: 0 | number_format(2,',',' ') }}`));
// console.log(compile('{% set sum1 = 0 %}{% for col in data.field %}{% set sum1 = sum1 + col.value %}{% endfor %}'));
// console.log(compile("Some kind of string: <b>{{ (sum1 + sum2) | number_format(2,',',' ') }} EUR</b><br />"));
// console.log(compile(`Some kind of string: <b>{{ (data.col+data.col1+data.col2) | number_format(2, ","," ") }} EUR</b>`));
