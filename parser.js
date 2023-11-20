const BINARY_OPERATIONS = {
  "+": {
    evaluate: (lhs, rhs) => lhs + rhs,
    precedance: 1,
  },
  "-": {
    evaluate: (lhs, rhs) => lhs - rhs,
    precedance: 1,
  },
  ">": {
    evaluate: (lhs, rhs) => lhs > rhs,
    precedance: 0,
  },
  "*": {
    evaluate: (lhs, rhs) => lhs * rhs,
    precedance: 2,
  },
  "/": {
    evaluate: (lhs, rhs) => lhs / rhs,
    precedance: 2,
  },
};

const blocks = ["{{", "}}", "{%", "%}"];

class Tokens {
  constructor(tokens) {
    if (!tokens || tokens.length === 0) {
      throw new Error("No tokens");
    }

    this.tokens = tokens;
  }

  advance() {
    // todo: out of bounds checking
    return ++this.current_index;
  }

  peek() {
    return this.tokens[this.current_index + 1];
  }

  get() {
    return this.tokens[this.current_index++];
  }

  current() {
    return this.tokens[this.current_index];
  }

  current_index = 0;
  tokens = [];
}

function tokenize(string) {
  const special = [
    "+",
    "-",
    "*",
    "/",
    "(",
    ")",
    "[",
    "]",
    "|",
    "=",
    ",",
    "<",
    ">",
    "%",
    "?",
    ":",
    "~",
  ];
  const htmlSpecial = ["<", ">", "/"];
  const whitespace = ["\n", "\t", " "];
  const stringChars = ["'", '"'];

  let tokens = [];
  let token = "";
  let in_twig_expression = false;

  for (let i = 0; i < string.length; ++i) {
    const blockCharPosition = blocks.indexOf(string.slice(i, i + 2));
    if (blockCharPosition !== -1) {
      if (token.length > 0) {
        tokens.push(token);
        token = "";
      }

      in_twig_expression = blockCharPosition % 2 === 0;
      tokens.push(string.slice(i, i + 2));

      ++i;
    } else if (in_twig_expression && special.includes(string[i])) {
      if (token.length > 0) {
        tokens.push(token);
        token = "";
      }

      token = string[i];

      while (special.includes(string[i + 1])) {
        ++i;
        token += string[i];
      }

      tokens.push(token);
      token = "";
    } else if (in_twig_expression && whitespace.includes(string[i])) {
      if (token.length > 0) {
        tokens.push(token);
        token = "";
      }
    } else if (stringChars.includes(string[i])) {
      if (token.length > 0) {
        tokens.push(token);
        token = "";
      }

      while (!stringChars.includes(string[++i])) {
        token += string[i];
      }

      tokens.push(token);
      token = "";
    } else {
      token += string[i];
    }
  }

  if (token.length > 0) {
    tokens.push(token);
  }

  if (in_twig_expression) {
    throw new Error("Unterminated twig expression: " + string);
  }

  return new Tokens(tokens);
}

/**
 * @param {Tokens} tokens
 */
function parse_primary(tokens) {
  let token = tokens.peek();

  if (!token || token === '}}') {
    token = tokens.current();
    tokens.advance();
    return token;
  }

  if (token === "(") {
    tokens.advance();
    let ast = parse(tokens);
    if (tokens.peek() !== ')') {
      throw new Error(`Expected ")", got ${tokens.current()}`);
    }
    tokens.advance();
    return ast;
  } else if (token && token !== "{{") {
    tokens.advance();
    return token;
  } else if (token === '{{') {
    tokens.advance();
    return parse_primary(tokens);
  }
}

/**
 * Source: https://eli.thegreenplace.net/2012/08/02/parsing-expressions-by-precedence-climbing
 * @param {Tokens} tokens
 */
function parse(tokens, min_precedance = 0) {
  let lhs = parse_primary(tokens);
  let lookahead;

  while (true) {
    lookahead = tokens.peek();

    if (!lookahead
      || !(lookahead in BINARY_OPERATIONS)
      || BINARY_OPERATIONS[lookahead].precedance < min_precedance) {
      break;
    }

    tokens.advance();

    const operation = lookahead;
    const precedance = BINARY_OPERATIONS[lookahead].precedance;

    lhs = {
      operation: BINARY_OPERATIONS[operation],
      lhs,
      rhs: parse(tokens, precedance + 1),
    };
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
  if (typeof ast_node === "object") {
    return ast_node.operation.evaluate(
      to_value(ast_node.lhs),
      evaluate(ast_node.rhs)
    );
  }

  return to_value(ast_node);
}


function preprocess(tokens) {
  let token = tokens.get();
  const output = [];
  while (token) {
    if (token === '{%') {
      const statement = tokens.get();
      if (statement === 'set') {
        const lvalue = tokens.get();
        const operator = tokens.current();
        output.push({
          type: 'set',
          lvalue,
          operator,
          rvalue: parse(tokens)
        });
        tokens.advance();
      } else if (statement === 'if') {
        const condition = parse(tokens);
        tokens.advance();
        output.push({
          type: 'if',
          condition,
          body: preprocess(tokens)
        });
      } else if (statement === 'for') {
        const lvalue = tokens.get();
        const operation = tokens.current();
        const iterable = parse(tokens);
        tokens.advance();
        output.push({
          type: 'for',
          lvalue,
          operation,
          iterable,
          body: preprocess(tokens)
        });
      } else if (statement.startsWith('end')) {
        // end of block
        tokens.advance();
        return output;
      }
    } else if (token === '{{') {
      output.push({
        type: 'twig_expression',
        ast: parse(tokens)
      });
    } else if (token !== '}}' && token !== '%}') {
      output.push({
        type: 'html',
        value: token
      });
    }

    // todo: function calls

    token = tokens.get();
  }

  return output;
}

function compile_twig_expression(string) {
  const tokens = tokenize(string);
  return parse(tokens);
}

function compile_template(string) {
  const tokens = tokenize(string);
  return preprocess(tokens);
}

// console.log(compile_twig_expression("{{ 2 + 5 * (3 + 1) }}<br/> test {{1+1}}"));
// console.log(compile_twig_expression('{{ 2>1 }}<br/>'));
// console.log(compile_twig_expression('{% set test = sum1 + col.value %}'));
// console.log(compile('{{ data.field1_1 }} EUR'));
// console.log(compile(`{{ data.field1_1 ?? 0 | number_format(2,',',' ') }}`));
// console.log(compile(`{{ data.field1_1 ?: 0 | number_format(2,',',' ') }}`));
console.log(compile_template('{% set sum1 = 0 %}{% for col in data.field %}{% set sum1 = sum1 + col.value %}Sum is: {{ sum1 }}{% endfor %}Total: {{ sum1 }} EUR'));
// console.log(compile("Some kind of string: <b>{{ (sum1 + sum2) | number_format(2,',',' ') }} EUR</b><br />"));
// console.log(compile(`Some kind of string: <b>{{ (data.col+data.col1+data.col2) | number_format(2, ","," ") }} EUR</b>`));
